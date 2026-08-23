# Batch 1 image production

## Production status

Five reviewed raster assets were generated with the built-in image generation tool and saved as WebP in the app. Existing Batch 1 assets that were not part of this review remain unchanged.

The new red and blue gladhand attempt was rejected. The colors were correct, but the connector geometry was not reliable enough for an equipment teaching card. The existing approved gladhand asset remains in use.

Official road signs and document fields remain deterministic HTML and course data. No AI raster is presented as an official sign, credential, report, ELD screen or document sample.

## Accepted assets

### Fifth wheel

- Path: `app/images/equipment/fifth-wheel-v01.webp`
- Prompt: square scientific educational equipment card. A correctly mounted fifth wheel coupling on the rear frame of a stationary contemporary US conventional Class A tractor, no trailer attached, realistic greased plate, throat, locking jaws, pivot mounts and release handle, neutral daylight, no people, text, labels, logos or invented parts.

### Hood inspection

- Path: `app/images/actions/open-hood-inspection-v01.webp`
- Prompt: square photorealistic inspection procedure card. A driver safely opens the forward-tilting hood of a stationary white US conventional tractor in an American inspection lane while an inspector observes from a safe position with a blank clipboard. Engine off, parking brake set, no readable agency marks, signs or documents.

### Document exchange

- Path: `app/images/actions/hand-documents-inspector-v01.webp`
- Prompt: square photorealistic inspection procedure card. A seated driver in a left-hand-drive US tractor hands a plain closed document folder through the open driver-side window to an inspector after a safe stop. The folder is blank, the vehicle is stationary and no readable document or badge text is visible.

### Open Hotshot car hauler

- Path: `app/images/situations/hotshot-car-hauler-v01.webp`
- Prompt: square scientific educational equipment card. A stationary unbranded white heavy-duty crew-cab dually pickup tows an open gooseneck multi-car hauler with two generic passenger cars, plausible hitch and axle geometry, visible wheel securement, neutral US inspection-yard setting, no plates, brands, text or official labels.

### Enclosed Hotshot car hauler

- Path: `app/images/situations/hotshot-enclosed-loading-v01.webp`
- Prompt: square scientific educational equipment card. A stationary unbranded white heavy-duty crew-cab dually pickup tows a long light-gray enclosed gooseneck car-hauler with a plain box body, tandem axles and closed rear loading ramp. The trailer is unmistakably enclosed, with no visible cargo, RV features, text, logos or official labels.

## QA decisions

- Open and enclosed Hotshot trailers are visually distinct.
- The Hotshot pickups show dual rear wheels and a bed-mounted gooseneck connection.
- The tractor hood scene shows a safe stationary inspection procedure.
- The document exchange uses a blank folder and does not simulate official paperwork.
- The fifth wheel asset shows a recognizable tractor coupling, not a pickup gooseneck ball.
- All accepted assets keep the teaching subject inside a square mobile-safe crop.
