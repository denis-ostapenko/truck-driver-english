"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRecorderController } = require("../app/recorder-controller.js");


function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}


function createTrack() {
  return {
    stopCalls: 0,
    stop() {
      this.stopCalls += 1;
    },
  };
}


function createStream() {
  const track = createTrack();
  return {
    track,
    getTracks() {
      return [track];
    },
  };
}


function createRecorderClass(settings = {}) {
  const instances = [];
  class FakeMediaRecorder {
    constructor(stream) {
      if (settings.throwConstruct) throw new Error("constructor failed");
      this.stream = stream;
      this.state = "inactive";
      this.mimeType = "audio/webm";
      this.startCalls = 0;
      this.stopCalls = 0;
      this.ondataavailable = null;
      this.onerror = null;
      this.onstop = null;
      instances.push(this);
    }

    start() {
      this.startCalls += 1;
      this.state = "recording";
      if (settings.throwStart) throw new Error("start failed");
    }

    stop() {
      this.stopCalls += 1;
      this.state = "inactive";
      if (settings.emitData !== false && this.ondataavailable) {
        this.ondataavailable({ data: new Blob(["mock audio"], { type: this.mimeType }) });
      }
      if (this.onstop) this.onstop();
    }
  }
  FakeMediaRecorder.instances = instances;
  return FakeMediaRecorder;
}


function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      if (listeners.has(name)) listeners.get(name).delete(listener);
    },
    dispatch(name) {
      const event = { type: name };
      for (const listener of listeners.get(name) || []) listener(event);
    },
    count(name) {
      return (listeners.get(name) || new Set()).size;
    },
  };
}


function createFixture(overrides = {}) {
  const stream = overrides.stream || createStream();
  const Recorder = overrides.MediaRecorder || createRecorderClass();
  const createdUrls = [];
  const revokedUrls = [];
  const errors = [];
  const states = [];
  const audioInstances = [];

  class FakeAudio {
    constructor(url) {
      this.src = url;
      this.pauseCalls = 0;
      this.playCalls = 0;
      this.onended = null;
      this.onerror = null;
      audioInstances.push(this);
    }

    play() {
      this.playCalls += 1;
      return Promise.resolve();
    }

    pause() {
      this.pauseCalls += 1;
    }
  }

  const controller = createRecorderController({
    getUserMedia: overrides.getUserMedia || (async () => stream),
    MediaRecorder: Recorder,
    Blob,
    Audio: overrides.Audio || FakeAudio,
    createObjectURL(blob) {
      const url = `blob:mock-${createdUrls.length + 1}`;
      createdUrls.push({ url, blob });
      return url;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    },
    lifecycleTarget: overrides.lifecycleTarget || null,
    onError(error, context) {
      errors.push({ error, context });
    },
    onStateChange(state) {
      states.push(state);
    },
  });

  return {
    controller,
    stream,
    Recorder,
    createdUrls,
    revokedUrls,
    errors,
    states,
    audioInstances,
  };
}


test("normal stop closes tracks, creates one URL, and dispose is idempotent", async () => {
  const fixture = createFixture();
  assert.equal(await fixture.controller.start(), true);
  assert.equal(fixture.controller.getState().isRecording, true);

  const url = await fixture.controller.stop();
  assert.equal(url, "blob:mock-1");
  assert.equal(fixture.stream.track.stopCalls, 1);
  assert.equal(fixture.createdUrls.length, 1);
  assert.equal(fixture.controller.getState().status, "ready");

  await fixture.controller.dispose("navigation");
  await fixture.controller.dispose("navigation-again");
  assert.equal(fixture.stream.track.stopCalls, 1);
  assert.deepEqual(fixture.revokedUrls, ["blob:mock-1"]);
  assert.equal(fixture.controller.getState().recordingUrl, null);
});


test("navigation stops an active recorder without creating an object URL", async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  const recorder = fixture.Recorder.instances[0];

  await fixture.controller.handleNavigation();
  assert.equal(recorder.stopCalls, 1);
  assert.equal(fixture.stream.track.stopCalls, 1);
  assert.equal(fixture.createdUrls.length, 0);
  assert.equal(fixture.controller.getState().hasStream, false);
});


test("a stale getUserMedia result is stopped by the generation token", async () => {
  const gate = deferred();
  const lateStream = createStream();
  const fixture = createFixture({ getUserMedia: () => gate.promise });

  const starting = fixture.controller.start();
  await Promise.resolve();
  await fixture.controller.handleNavigation();
  gate.resolve(lateStream);

  assert.equal(await starting, false);
  assert.equal(lateStream.track.stopCalls, 1);
  assert.equal(fixture.Recorder.instances.length, 0);
});


test("two overlapping starts keep only the newest stream", async () => {
  const firstGate = deferred();
  const secondGate = deferred();
  const firstStream = createStream();
  const secondStream = createStream();
  let requestCount = 0;
  const fixture = createFixture({
    getUserMedia: () => {
      requestCount += 1;
      return requestCount === 1 ? firstGate.promise : secondGate.promise;
    },
  });

  const firstStart = fixture.controller.start();
  const secondStart = fixture.controller.start();
  firstGate.resolve(firstStream);
  secondGate.resolve(secondStream);

  assert.equal(await firstStart, false);
  assert.equal(await secondStart, true);
  assert.equal(firstStream.track.stopCalls, 1);
  assert.equal(secondStream.track.stopCalls, 0);
  assert.equal(fixture.Recorder.instances.length, 1);

  await fixture.controller.dispose("test-end");
  assert.equal(secondStream.track.stopCalls, 1);
});


test("constructor and start failures never leak the acquired stream", async (t) => {
  await t.test("constructor failure", async () => {
    const stream = createStream();
    const fixture = createFixture({ stream, MediaRecorder: createRecorderClass({ throwConstruct: true }) });
    assert.equal(await fixture.controller.start(), false);
    assert.equal(stream.track.stopCalls, 1);
    assert.equal(fixture.errors[0].context.phase, "construct");
  });

  await t.test("start failure", async () => {
    const stream = createStream();
    const Recorder = createRecorderClass({ throwStart: true });
    const fixture = createFixture({ stream, MediaRecorder: Recorder });
    assert.equal(await fixture.controller.start(), false);
    assert.equal(Recorder.instances[0].stopCalls, 1);
    assert.equal(stream.track.stopCalls, 1);
    assert.equal(fixture.errors[0].context.phase, "start");
  });
});


test("delete during recording stops all resources and suppresses late data", async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  const recorder = fixture.Recorder.instances[0];

  await fixture.controller.deleteRecording();
  assert.equal(recorder.stopCalls, 1);
  assert.equal(fixture.stream.track.stopCalls, 1);
  assert.equal(fixture.createdUrls.length, 0);
  assert.equal(fixture.controller.getState().recordingBlob, null);
});


test("MediaRecorder error stops recorder and tracks", async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  const recorder = fixture.Recorder.instances[0];
  recorder.onerror({ error: new Error("device disconnected") });

  assert.equal(recorder.stopCalls, 1);
  assert.equal(fixture.stream.track.stopCalls, 1);
  assert.equal(fixture.errors[0].context.phase, "recording");
  assert.equal(fixture.controller.getState().status, "error");
});


test("navigation pauses playback and revokes its object URL", async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  await fixture.controller.stop();
  assert.equal(await fixture.controller.play(), true);
  assert.equal(fixture.audioInstances[0].playCalls, 1);

  await fixture.controller.handleNavigation();
  assert.equal(fixture.audioInstances[0].pauseCalls, 1);
  assert.equal(fixture.audioInstances[0].src, "");
  assert.deepEqual(fixture.revokedUrls, ["blob:mock-1"]);
});


test("pagehide lifecycle cleanup is attached and removable", async () => {
  const target = createEventTarget();
  const fixture = createFixture({ lifecycleTarget: target });
  assert.equal(target.count("pagehide"), 1);
  assert.equal(target.count("beforeunload"), 1);

  await fixture.controller.start();
  target.dispatch("pagehide");
  assert.equal(fixture.stream.track.stopCalls, 1);
  assert.equal(fixture.Recorder.instances[0].stopCalls, 1);

  await fixture.controller.destroy();
  assert.equal(target.count("pagehide"), 0);
  assert.equal(target.count("beforeunload"), 0);
  assert.equal(await fixture.controller.start(), false);
});


test("throwing UI callbacks cannot interrupt cleanup", async () => {
  const stream = createStream();
  const Recorder = createRecorderClass();
  const controller = createRecorderController({
    getUserMedia: async () => stream,
    MediaRecorder: Recorder,
    Blob,
    createObjectURL: () => "blob:unused",
    revokeObjectURL: () => {},
    lifecycleTarget: null,
    onStateChange() { throw new Error("state UI failed"); },
    onError() { throw new Error("error UI failed"); },
  });

  assert.equal(await controller.start(), true);
  Recorder.instances[0].onerror({ error: new Error("device failed") });
  assert.equal(Recorder.instances[0].stopCalls, 1);
  assert.equal(stream.track.stopCalls, 1);
  assert.equal(controller.getState().status, "error");
});
