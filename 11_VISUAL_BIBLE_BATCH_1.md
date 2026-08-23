# Visual bible and Batch 1

## Current Cycle 1 contract

Batch 1 image composition remains valid, but its old sign inventory is superseded by Cycle 1. The runtime now separates 49 original FHWA SVG files, 15 variable-local training cards and 16 clearly labeled `TRAINING DMS` simulations. AI raster is never used for an official sign, DMS legend, credential, document field or compliance diagram. Exact `assetCode`, `assetPath`, displayed legend and `assetAlt` are validated together for every official SVG.

Tractor-trailer, Hotshot open and Hotshot enclosed are separate applicability profiles. Raster selection must follow profile metadata and must not present an open trailer image for an enclosed-only lesson or situation.

## Hotshot addendum

The vehicle family now includes a generic heavy-duty dually pickup with open or enclosed gooseneck car-hauler trailers. Open and enclosed configurations must remain visually distinct. Loaded vehicles need plausible securement, but generated images are recognition aids and never replace an official securement diagram. Unsafe or ambiguous tiedown generations are rejected.

## Visual system

- Audience: adult Russian-speaking Class A tractor-trailer drivers in the United States.
- Use: meaning recognition, equipment identification and work-situation recall.
- Style: realistic instructional photography with documentary restraint.
- Vehicle: contemporary generic US Class A sleeper tractor with a 53-foot dry van or reefer trailer, left-hand-drive cab, driving and inspection environment consistent with the United States.
- Fleet continuity: neutral white tractor, light gray trailer, dark chassis, no carrier branding.
- People: practical work clothing, natural posture, no staged advertising look.
- Light: neutral daylight. Emergency lighting is reserved for roadside scenes.
- Composition: one clear teaching subject, uncluttered background, safe center crop for 390 px mobile.
- Equipment cards: square, equipment fills about 70 percent of frame, realistic mounting and connections.
- Action cards: square, hands and tool contact clearly visible, vehicle stationary.
- Situation heroes: horizontal 3:2, main interaction centered, enough edge room for responsive crop.
- Text policy: no readable signs, VINs, plates, unit numbers, document fields, labels, logos or watermarks in AI raster.
- Exact graphics: signs, dynamic messages, documents, field labels and procedure diagrams are rendered separately from verified data.

## Safety invariants

- Truck is stationary for inspection, document exchange and equipment checks.
- Parking brake is set where an inspection interaction is shown.
- No phone is held while driving.
- No person stands between a moving tractor and trailer.
- Roadside breakdown shows the vehicle fully on the shoulder, hazard lights and warning devices.
- Inspector and driver remain outside live traffic lanes.

## Domain QA gates

1. Equipment is mounted in the correct area and has plausible proportions.
2. Red emergency or supply air line and blue service air line are not reversed.
3. Fifth wheel, landing gear and tandem components are not merged or invented.
4. Inspection scenes show a safe stop before commands or document exchange.
5. No generated raster is presented as an official sign, report, credential or ELD screen.
6. Any accidental pseudo-text causes rejection or a crop that removes it.
7. Desktop and 390 px crops keep the teaching subject visible.

## Batch 1 composition

### Equipment cards

1. Fifth wheel assembly on tractor frame.
2. Red and blue trailer air-line gladhands connected correctly.
3. Trailer landing gear in raised travel position.
4. Sliding trailer tandems with locked slider pins.

### Action cards

1. Driver checks a tamper-evident seal on closed trailer doors.
2. Driver opens the tractor hood in an inspection lane while an inspector observes from a safe position.
3. Driver hands a plain document folder to an inspector through the open driver-side window after stopping.
4. Driver inspects a tire sidewall and tread during a stationary pre-trip check.

### Situation heroes

1. Roadside inspection initial contact.
2. Level II walk-around inspection.
3. Security gate check-in.
4. Roadside breakdown call from a safe position beside the parked truck.

## Sign and document labeling check

- The current app sign cards render exact course strings with deterministic HTML and CSS. Batch 1 does not replace them with generated images.
- The current document viewer renders synthetic field names and values from course data and displays `TRAINING SAMPLE, NOT VALID`. Batch 1 does not replace it with generated paperwork.
- Raster scenes may contain a blank folder, clipboard or distant infrastructure, but never readable official text.
