export function detectFileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();

  if (!ext) return "other";

  const map: Record<string, string> = {
    pdf: "pdf",
    txt: "text",
    csv: "spreadsheet",

    doc: "document",
    docx: "document",
    xls: "spreadsheet",
    xlsx: "spreadsheet",
    ppt: "presentation",
    pptx: "presentation",

    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    svg: "image",

    mp4: "video",
    mov: "video",
    avi: "video",

    mp3: "audio",
    wav: "audio",

    zip: "archive",
    rar: "archive",

    default: "other",
  };

  return map[ext] ?? "other";
}
