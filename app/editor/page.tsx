import type { Metadata } from "next";
import { EditorEntry } from "@/editor/editor-entry";

export const metadata: Metadata = { title: "Editor" };

export default function EditorPage() {
  return <EditorEntry />;
}
