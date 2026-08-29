import { strFromU8, unzipSync } from "fflate";
import type { LoadedScore, ScoreInfo } from "./scoreTypes";

const VALID_EXTENSIONS = ["mxl", "musicxml", "xml"] as const;

type ScoreExtension = (typeof VALID_EXTENSIONS)[number];

export async function loadScoreFile(file: File): Promise<LoadedScore> {
  const extension = getExtension(file.name);
  if (!extension) {
    throw new Error("Select an .mxl, .musicxml, or .xml score file.");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const xmlText = extension === "mxl" ? extractMusicXmlFromMxl(buffer) : new TextDecoder("utf-8").decode(buffer);
  const info = extractScoreInfo(xmlText, file.name);

  return {
    fileName: file.name,
    fileType: extension,
    xmlText,
    info,
  };
}

function getExtension(fileName: string): ScoreExtension | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return VALID_EXTENSIONS.includes(extension as ScoreExtension) ? (extension as ScoreExtension) : null;
}

export function extractMusicXmlFromMxl(data: Uint8Array): string {
  const zip = unzipSync(data);
  const containerEntry = zip["META-INF/container.xml"];
  let rootPath: string | undefined;

  if (containerEntry) {
    const containerXml = strFromU8(containerEntry);
    const doc = parseXml(containerXml, "MXL container");
    rootPath = doc.querySelector("rootfile")?.getAttribute("full-path") ?? undefined;
  }

  const fallbackPath = Object.keys(zip).find((path) => path.toLowerCase().endsWith(".xml") && path !== "META-INF/container.xml");
  const selectedPath = rootPath ?? fallbackPath;
  if (!selectedPath || !zip[selectedPath]) {
    throw new Error("The .mxl archive does not contain a MusicXML score document.");
  }

  return strFromU8(zip[selectedPath]);
}

export function extractScoreInfo(xmlText: string, fileName?: string): ScoreInfo {
  const doc = parseXml(xmlText, "MusicXML score");
  const workTitle = text(doc.querySelector("work-title"));
  const movementTitle = text(doc.querySelector("movement-title"));
  const credits = Array.from(doc.querySelectorAll("credit"));
  const typedCredit = (type: string) => credits
    .find((credit) => Array.from(credit.querySelectorAll(":scope > credit-type")).some((item) => normalizedText(item)?.toLowerCase() === type))
    ?.querySelector("credit-words");
  const composer = normalizedText(Array.from(doc.querySelectorAll("creator"))
    .find((creator) => creator.getAttribute("type") === "composer")
  ) ?? normalizedText(typedCredit("composer"));
  const typedTitle = normalizedText(typedCredit("title"));
  const typedSubtitle = normalizedText(typedCredit("subtitle"));
  const centredCredits = Array.from(doc.querySelectorAll("credit-words"))
    .map((element, order) => ({
      value: normalizedText(element),
      order,
      fontSize: Number(element.getAttribute("font-size")) || 0,
      centred: element.getAttribute("justify")?.toLowerCase() === "center",
      firstPage: (element.closest("credit")?.getAttribute("page") ?? "1") === "1",
    }))
    .filter((item): item is typeof item & { value: string } => typeof item.value === "string" && item.centred && item.firstPage && !isAttribution(item.value))
    .sort((a, b) => b.fontSize - a.fontSize || a.order - b.order);
  const inferredTitle = centredCredits[0]?.value;
  const title = workTitle ?? movementTitle ?? typedTitle ?? inferredTitle ?? cleanFileTitle(fileName);
  const subtitle = distinctFromTitle(workTitle && movementTitle ? movementTitle : undefined, title)
    ?? distinctFromTitle(typedSubtitle, title)
    ?? centredCredits.map((item) => item.value).find((value) => distinctFromTitle(value, title))
    ?? distinctFromTitle(composer, title);

  return {
    title,
    subtitle,
    movementTitle,
    composer,
    partCount: doc.querySelectorAll("score-part").length,
  };
}

export function parseXml(xmlText: string, label: string): XMLDocument {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const error = doc.querySelector("parsererror");
  if (error) {
    throw new Error(`${label} could not be parsed as XML.`);
  }
  return doc;
}

function text(element: Element | null): string | undefined {
  return normalizedText(element);
}

function normalizedText(element: Element | null | undefined): string | undefined {
  const value = element?.textContent?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

function distinctFromTitle(value: string | undefined, title: string | undefined): string | undefined {
  return value && value.localeCompare(title ?? "", undefined, { sensitivity: "base" }) !== 0 ? value : undefined;
}

function cleanFileTitle(fileName: string | undefined): string | undefined {
  const value = fileName?.replace(/\.(?:mxl|musicxml|xml)$/i, "").trim();
  return value || undefined;
}

function isAttribution(value: string): boolean {
  return /^(?:composer|arrang(?:er|ed)|lyric(?:ist|s)|words|music|rights|copyright|transcription|edited|engraved|performed)\b/i.test(value);
}
