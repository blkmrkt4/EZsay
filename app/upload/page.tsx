"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const DOC_TYPES = [
  { value: "academic", label: "Academic" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "legal", label: "Legal" },
];

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("professional");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleUpload() {
    if (!file && !pastedText.trim()) {
      setError("Upload a file or paste your text.");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    if (file) formData.append("file", file);
    else formData.append("text", pastedText);

    formData.append("title", title || file?.name || "Pasted Document");
    formData.append("documentType", docType);

    let json;
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      json = await res.json();
    } catch {
      setError("Could not connect to the server. Check your connection and try again.");
      setUploading(false);
      return;
    }

    if (!json.success) {
      setError(json.error || "Upload failed. Please try again.");
      setUploading(false);
      return;
    }

    // Redirect to results — scanning happens there
    router.push(`/results/${json.data.documentId}`);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      if (!title) setTitle(dropped.name.replace(/\.[^.]+$/, ""));
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
    }
  }

  const wordCount = pastedText.trim()
    ? pastedText.trim().split(/\s+/).length
    : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Upload your document</h1>
      <p className="mt-2 text-sm text-gray-500">
        Upload a PDF, .docx, or .txt file, or paste your text directly.
      </p>

      <div className="mt-8 space-y-6">
        {/* Title */}
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700"
          >
            Document title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My essay"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Document type */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Document type
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt.value}
                onClick={() => setDocType(dt.value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  docType === dt.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {dt.label}
              </button>
            ))}
          </div>
        </div>

        {/* File upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : file
                ? "border-green-300 bg-green-50"
                : "border-gray-300 bg-gray-50 hover:border-gray-400"
          }`}
        >
          {file ? (
            <div className="text-center">
              <p className="text-sm font-medium text-green-700">{file.name}</p>
              <p className="mt-1 text-xs text-gray-500">
                {(file.size / 1024).toFixed(0)} KB
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="mt-2 text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-gray-500">
                Drop a file here or click to upload
              </p>
              <p className="mt-1 text-xs text-gray-400">
                PDF, .docx, or .txt
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-3 text-gray-400">
              or paste your text
            </span>
          </div>
        </div>

        {/* Paste area */}
        <div>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={10}
            disabled={!!file}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            placeholder="Paste your document text here..."
          />
          {wordCount > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {wordCount.toLocaleString()} words
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleUpload}
          disabled={uploading || (!file && !pastedText.trim())}
          className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? "Uploading and parsing..." : "Upload and scan"}
        </button>
      </div>
    </div>
  );
}
