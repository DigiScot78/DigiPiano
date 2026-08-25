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
  const info = extractScoreInfo(xmlText);

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

export function extractScoreInfo(xmlText: string): ScoreInfo {
  const doc = parseXml(xmlText, "MusicXML score");
  const title = text(doc.querySelector("work-title")) ?? text(doc.querySelector("movement-title"));
  const movementTitle = text(doc.querySelector("movement-title"));
  const composer = Array.from(doc.querySelectorAll("creator"))
    .find((creator) => creator.getAttribute("type") === "composer")
    ?.textContent?.trim();

  return {
    title,
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
  const value = element?.textContent?.trim();
  return value ? value : undefined;
}
