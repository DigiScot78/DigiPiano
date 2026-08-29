import { describe, expect, it } from "vitest";
import { extractScoreInfo } from "./musicXmlLoader";

function score(metadata: string) {
  return `<?xml version="1.0"?><score-partwise><work>${metadata}</work><part-list><score-part id="P1" /></part-list></score-partwise>`;
}

describe("score metadata", () => {
  it("uses a work title with a distinct movement subtitle", () => {
    const info = extractScoreInfo(score("<work-title>Suite</work-title></work><movement-title>Prelude</movement-title><work>"));
    expect(info).toMatchObject({ title: "Suite", subtitle: "Prelude", movementTitle: "Prelude" });
  });

  it("reads typed title and subtitle credits", () => {
    const info = extractScoreInfo(score("</work><credit page=\"1\"><credit-type>title</credit-type><credit-words>Mad World</credit-words></credit><credit page=\"1\"><credit-type>subtitle</credit-type><credit-words>Piano Solo</credit-words></credit><work>"));
    expect(info).toMatchObject({ title: "Mad World", subtitle: "Piano Solo" });
  });

  it("infers centred untyped credits and rejects attribution lines", () => {
    const info = extractScoreInfo(score("</work><credit page=\"1\"><credit-words justify=\"right\" font-size=\"10\">Composer: A Person</credit-words></credit><credit page=\"1\"><credit-words justify=\"center\" font-size=\"20\">The Prelude</credit-words></credit><credit page=\"1\"><credit-words justify=\"center\" font-size=\"13\">from Final Fantasy IV</credit-words></credit><work>"));
    expect(info).toMatchObject({ title: "The Prelude", subtitle: "from Final Fantasy IV" });
  });

  it("uses composer as the secondary line and the clean filename as the final title fallback", () => {
    const withComposer = extractScoreInfo(score("</work><identification><creator type=\"composer\">A Composer</creator></identification><work>"), "untitled.musicxml");
    expect(withComposer).toMatchObject({ title: "untitled", subtitle: "A Composer", composer: "A Composer" });
    const withCreditComposer = extractScoreInfo(score("</work><credit><credit-type>title</credit-type><credit-words>Mad World</credit-words></credit><credit><credit-type>composer</credit-type><credit-words>Michael Andrews</credit-words></credit><work>"));
    expect(withCreditComposer).toMatchObject({ title: "Mad World", subtitle: "Michael Andrews", composer: "Michael Andrews" });
    expect(extractScoreInfo(score(""), "Practice.Score.mxl").title).toBe("Practice.Score");
  });

  it("does not repeat a title as its subtitle", () => {
    const info = extractScoreInfo(score("<work-title>Same</work-title></work><credit page=\"1\"><credit-words justify=\"center\" font-size=\"20\">same</credit-words></credit><work>"));
    expect(info.subtitle).toBeUndefined();
  });
});
