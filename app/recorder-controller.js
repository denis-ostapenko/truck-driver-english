(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TruckDriverRecorder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;

  function createRecorderController(options) {
    const config = options || {};
    const getUserMedia = config.getUserMedia || (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
        ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        : null
    );
    const MediaRecorderClass = config.MediaRecorder || (
      typeof MediaRecorder !== "undefined" ? MediaRecorder : null
    );
    const BlobClass = config.Blob || (typeof Blob !== "undefined" ? Blob : null);
    const createObjectURL = config.createObjectURL || (
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL.bind(URL)
        : null
    );
    const revokeObjectURL = config.revokeObjectURL || (
      typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function"
        ? URL.revokeObjectURL.bind(URL)
        : null
    );
    const AudioClass = config.Audio || (typeof Audio !== "undefined" ? Audio : null);
    const onStateChange = typeof config.onStateChange === "function" ? config.onStateChange : function () {};
    const onError = typeof config.onError === "function" ? config.onError : function () {};

    let generation = 0;
    let recorder = null;
    let stream = null;
    let chunks = [];
    let recordingBlob = null;
    let recordingUrl = null;
    let playback = null;
    let pendingStop = null;
    let status = "idle";
    let destroyed = false;
    const lifecycleBindings = [];

    function emit(nextStatus, detail) {
      status = nextStatus;
      try {
        onStateChange({
          status: nextStatus,
          generation: generation,
          detail: detail || null,
        });
      } catch (_error) {
        // UI callback failures must not interrupt recorder cleanup.
      }
    }

    function report(error, phase) {
      const normalized = error instanceof Error ? error : new Error(String(error || "Recorder error"));
      try {
        onError(normalized, { phase: phase, generation: generation });
      } catch (_error) {
        // Error rendering is outside the resource lifecycle.
      }
    }

    function stopTracks(targetStream) {
      if (!targetStream || typeof targetStream.getTracks !== "function") return;
      let tracks;
      try {
        tracks = targetStream.getTracks();
      } catch (_error) {
        return;
      }
      if (!tracks || typeof tracks.forEach !== "function") return;
      tracks.forEach(function (track) {
        if (!track || typeof track.stop !== "function") return;
        try {
          track.stop();
        } catch (_error) {
          // A track can already be ended by the browser. Cleanup must remain idempotent.
        }
      });
    }

    function detachRecorder(targetRecorder) {
      if (!targetRecorder) return;
      targetRecorder.ondataavailable = null;
      targetRecorder.onerror = null;
      targetRecorder.onstop = null;
    }

    function pausePlayback() {
      const target = playback;
      playback = null;
      if (!target) return;
      target.onended = null;
      target.onerror = null;
      if (typeof target.pause === "function") {
        try {
          target.pause();
        } catch (_error) {
          // Playback cleanup must not prevent stream cleanup.
        }
      }
      try {
        target.src = "";
      } catch (_error) {
        // Some test doubles and older media elements expose a read-only src.
      }
    }

    function releaseRecording() {
      if (recordingUrl && revokeObjectURL) {
        try {
          revokeObjectURL(recordingUrl);
        } catch (_error) {
          // The browser can already have released an object URL.
        }
      }
      recordingUrl = null;
      recordingBlob = null;
    }

    function settlePendingStop(value) {
      if (!pendingStop) return;
      const current = pendingStop;
      pendingStop = null;
      current.resolve(value);
    }

    function dispose(reason) {
      generation += 1;
      const targetRecorder = recorder;
      const targetStream = stream;
      recorder = null;
      stream = null;
      chunks = [];
      settlePendingStop(null);
      detachRecorder(targetRecorder);

      if (targetRecorder && targetRecorder.state !== "inactive" && typeof targetRecorder.stop === "function") {
        try {
          targetRecorder.stop();
        } catch (_error) {
          // Tracks are stopped below even if MediaRecorder.stop() rejects the state.
        }
      }
      stopTracks(targetStream);
      pausePlayback();
      releaseRecording();
      emit("idle", reason || "dispose");
      return Promise.resolve();
    }

    function failStart(error, phase, token, acquiredStream, targetRecorder) {
      detachRecorder(targetRecorder);
      if (targetRecorder && targetRecorder.state !== "inactive" && typeof targetRecorder.stop === "function") {
        try {
          targetRecorder.stop();
        } catch (_error) {
          // Track cleanup below is the final fallback.
        }
      }
      stopTracks(acquiredStream);
      if (token === generation) {
        recorder = null;
        stream = null;
        chunks = [];
        generation += 1;
        emit("error", phase);
        report(error, phase);
      }
      return false;
    }

    async function start(constraints) {
      if (destroyed) {
        report(new Error("Recorder controller is destroyed"), "start");
        return false;
      }

      dispose("restart");
      const token = generation;
      emit("requesting", "permission");

      if (!getUserMedia || !MediaRecorderClass || !BlobClass || !createObjectURL) {
        return failStart(new Error("Recording is not supported in this browser"), "unsupported", token, null, null);
      }

      let acquiredStream;
      try {
        acquiredStream = await getUserMedia(constraints || { audio: true });
      } catch (error) {
        return failStart(error, "getUserMedia", token, null, null);
      }

      if (token !== generation || destroyed) {
        stopTracks(acquiredStream);
        return false;
      }

      let targetRecorder;
      try {
        targetRecorder = new MediaRecorderClass(acquiredStream, config.mediaRecorderOptions);
      } catch (error) {
        return failStart(error, "construct", token, acquiredStream, null);
      }

      const activeChunks = [];
      stream = acquiredStream;
      recorder = targetRecorder;
      chunks = activeChunks;

      targetRecorder.ondataavailable = function (event) {
        if (token !== generation || !event || !event.data) return;
        if (typeof event.data.size === "number" && event.data.size === 0) return;
        activeChunks.push(event.data);
      };

      targetRecorder.onerror = function (event) {
        if (token !== generation) return;
        const error = event && event.error ? event.error : new Error("MediaRecorder failed");
        dispose("error");
        emit("error", "recording");
        report(error, "recording");
      };

      targetRecorder.onstop = function () {
        stopTracks(acquiredStream);
        if (token !== generation || destroyed) return;

        if (recorder === targetRecorder) recorder = null;
        if (stream === acquiredStream) stream = null;
        detachRecorder(targetRecorder);
        chunks = [];

        try {
          const mimeType = targetRecorder.mimeType || config.mimeType || "audio/webm";
          const blob = new BlobClass(activeChunks, { type: mimeType });
          releaseRecording();
          recordingBlob = blob;
          recordingUrl = createObjectURL(blob);
          emit("ready", "stop");
          settlePendingStop(recordingUrl);
        } catch (error) {
          releaseRecording();
          emit("error", "object-url");
          report(error, "object-url");
          settlePendingStop(null);
        }
      };

      try {
        if (config.timeslice === undefined) targetRecorder.start();
        else targetRecorder.start(config.timeslice);
      } catch (error) {
        return failStart(error, "start", token, acquiredStream, targetRecorder);
      }
      emit("recording", "start");
      return true;
    }

    function stop() {
      const targetRecorder = recorder;
      if (pendingStop && pendingStop.token === generation) return pendingStop.promise;
      if (!targetRecorder || targetRecorder.state === "inactive") {
        return Promise.resolve(recordingUrl);
      }

      let resolveStop;
      const promise = new Promise(function (resolve) {
        resolveStop = resolve;
      });
      pendingStop = { token: generation, promise: promise, resolve: resolveStop };
      emit("stopping", "stop");
      try {
        targetRecorder.stop();
      } catch (error) {
        const targetStream = stream;
        detachRecorder(targetRecorder);
        recorder = null;
        stream = null;
        chunks = [];
        stopTracks(targetStream);
        emit("error", "stop");
        report(error, "stop");
        settlePendingStop(null);
      }
      return promise;
    }

    async function play() {
      if (!recordingUrl || !AudioClass || destroyed) return false;
      pausePlayback();
      const token = generation;
      let target;
      try {
        target = new AudioClass(recordingUrl);
        playback = target;
        target.onended = function () {
          if (playback === target) playback = null;
        };
        target.onerror = function () {
          if (playback === target) playback = null;
        };
        const result = target.play();
        if (result && typeof result.then === "function") await result;
        return token === generation && playback === target;
      } catch (error) {
        if (playback === target) playback = null;
        if (target && typeof target.pause === "function") {
          try {
            target.pause();
          } catch (_error) {
            // The original playback failure is reported below.
          }
        }
        report(error, "playback");
        return false;
      }
    }

    function stopPlayback() {
      pausePlayback();
    }

    function deleteRecording() {
      return dispose("delete");
    }

    function handleNavigation() {
      return dispose("navigation");
    }

    function handleError(error) {
      dispose("error");
      emit("error", "external");
      report(error, "external");
      return Promise.resolve();
    }

    function attachLifecycle(target, eventNames) {
      if (!target || typeof target.addEventListener !== "function") return function () {};
      const names = eventNames || ["pagehide", "beforeunload"];
      const records = [];
      names.forEach(function (eventName) {
        const handler = function () {
          dispose(eventName);
        };
        target.addEventListener(eventName, handler);
        const record = { target: target, eventName: eventName, handler: handler };
        lifecycleBindings.push(record);
        records.push(record);
      });
      return function () {
        records.forEach(removeLifecycleRecord);
      };
    }

    function removeLifecycleRecord(record) {
      if (!record) return;
      if (record.target && typeof record.target.removeEventListener === "function") {
        record.target.removeEventListener(record.eventName, record.handler);
      }
      const index = lifecycleBindings.indexOf(record);
      if (index >= 0) lifecycleBindings.splice(index, 1);
    }

    function detachLifecycle() {
      lifecycleBindings.slice().forEach(removeLifecycleRecord);
    }

    function destroy() {
      if (destroyed) return Promise.resolve();
      destroyed = true;
      detachLifecycle();
      return dispose("destroy");
    }

    function getState() {
      return {
        status: status,
        generation: generation,
        isRecording: Boolean(recorder && recorder.state === "recording"),
        hasStream: Boolean(stream),
        recordingBlob: recordingBlob,
        recordingUrl: recordingUrl,
        isPlaying: Boolean(playback),
        destroyed: destroyed,
      };
    }

    const defaultLifecycleTarget = config.lifecycleTarget === undefined
      ? (typeof window !== "undefined" ? window : null)
      : config.lifecycleTarget;
    if (defaultLifecycleTarget) attachLifecycle(defaultLifecycleTarget, config.lifecycleEvents);

    return {
      start: start,
      stop: stop,
      play: play,
      stopPlayback: stopPlayback,
      deleteRecording: deleteRecording,
      dispose: dispose,
      handleNavigation: handleNavigation,
      handleError: handleError,
      attachLifecycle: attachLifecycle,
      detachLifecycle: detachLifecycle,
      destroy: destroy,
      getState: getState,
    };
  }

  return {
    VERSION: VERSION,
    createRecorderController: createRecorderController,
  };
});
