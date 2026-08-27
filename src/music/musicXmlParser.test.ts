import { describe, expect, it } from "vitest";
import { parseMusicXmlTimeline } from "./musicXmlParser";

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <staves>2</staves>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
      <backup><duration>2</duration></backup>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>4</duration>
        <voice>2</voice>
        <staff>2</staff>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
      <barline location="right"><repeat direction="forward"/></barline>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>2</duration>
        <tie type="start"/>
        <voice>1</voice>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>2</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

describe("parseMusicXmlTimeline", () => {
  it("builds an ordered playable timeline with chords, backup, staves, and tie starts", () => {
    const parsed = parseMusicXmlTimeline(fixture);
    expect(parsed.events.map((event) => event.midiNotes)).toEqual([[48, 60, 64], [67]]);
    expect(parsed.events[0]).toMatchObject({
      measureNumber: 1,
      startQuarter: 0,
      durationQuarters: 2,
      staffNumbers: [1, 2],
      voiceNumbers: ["1", "2"],
    });
    expect(parsed.events[1]).toMatchObject({
      measureNumber: 2,
      midiNotes: [67],
    });
  });

  it("keeps pitched notes playable when another voice has rests at the same timestamp", () => {
    const parsed = parseMusicXmlTimeline(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><staves>2</staves></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>1</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
      <backup><duration>4</duration></backup>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>1</duration>
        <voice>3</voice>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>1</duration>
        <voice>3</voice>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>1</duration>
        <voice>3</voice>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>G</step><octave>5</octave></pitch>
        <duration>1</duration>
        <voice>3</voice>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`);

    expect(parsed.events.map((event) => event.midiNotes)).toEqual([[72], [74], [76], [79]]);
    expect(parsed.events.every((event) => !event.isRest)).toBe(true);
    expect(parsed.diagnostics?.firstPitchedMeasureByStaff).toEqual({ "1": 1 });
    expect(parsed.diagnostics?.measures[0].pitchedByStaffVoice).toEqual({ "1:1": 1, "1:3": 4 });
    expect(parsed.diagnostics?.measures[0].restsByStaff).toEqual({ "1": 2 });
  });

  it("reports MusicXML print system markers and measure staff counts", () => {
    const parsed = parseMusicXmlTimeline(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1" width="320">
      <print><system-layout /></print>
      <attributes><divisions>1</divisions><staves>2</staves></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
      <backup><duration>1</duration></backup>
      <note>
        <rest />
        <duration>1</duration>
        <voice>5</voice>
        <staff>2</staff>
      </note>
    </measure>
    <measure number="2" width="280">
      <print new-system="yes" />
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>5</voice>
        <staff>2</staff>
      </note>
    </measure>
  </part>
</score-partwise>`);

    expect(parsed.diagnostics?.firstPitchedMeasureByStaff).toEqual({ "1": 1, "2": 2 });
    expect(parsed.diagnostics?.measures).toMatchObject([
      {
        measureNumber: 1,
        pitchedByStaff: { "1": 1 },
        restsByStaff: { "2": 1 },
        hasSystemLayout: true,
        printNewSystem: false,
        width: 320,
      },
      {
        measureNumber: 2,
        pitchedByStaff: { "2": 1 },
        printNewSystem: true,
        width: 280,
      },
    ]);
  });

  it("preserves MusicXML pitch spelling and key signature context", () => {
    const parsed = parseMusicXmlTimeline(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>-4</fifths></key></attributes>
      <note>
        <pitch><step>A</step><alter>-1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`);

    expect(parsed.events[0]).toMatchObject({ midiNotes: [68], keyFifths: -4 });
    expect(parsed.events[0].noteDetails[0]).toMatchObject({
      midiNote: 68,
      pitchStep: "A",
      pitchAlter: -1,
      pitchOctave: 4,
    });
  });
  it("warns that repeats are detected but not expanded", () => {
    const parsed = parseMusicXmlTimeline(fixture);
    expect(parsed.warnings.some((warning) => warning.includes("repeats"))).toBe(true);
  });
});
