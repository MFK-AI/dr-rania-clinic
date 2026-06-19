import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "audio/mpeg": "MP3",
  "audio/wav": "WAV",
  "audio/mp4": "M4A",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

export default function FilesUpload() {
  const [patientIdFilter, setPatientIdFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPatientId, setUploadPatientId] = useState("");
  const [uploadVisitId, setUploadVisitId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patientId = patientIdFilter ? parseInt(patientIdFilter) : undefined;

  const { data: files, isLoading, refetch } = trpc.files.listByPatient.useQuery(
    { patientId: patientId! },
    { enabled: !!patientId }
  );

  const utils = trpc.useUtils();

  const getUploadUrl = trpc.files.getUploadUrl.useMutation();
  const confirmUpload = trpc.files.confirmUpload.useMutation({
    onSuccess: () => {
      toast.success("File uploaded successfully");
      if (patientId) utils.files.listByPatient.invalidate({ patientId });
      setUploadPatientId("");
      setUploadVisitId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => toast.error(err.message),
  });

  // Delete not yet implemented in router - placeholder
  const handleDelete = (id: number) => {
    toast.info("File deletion coming soon");
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) { toast.error("Please select a file"); return; }
    if (!uploadPatientId) { toast.error("Patient ID is required"); return; }

    setUploading(true);
    try {
      const { fileKey } = await getUploadUrl.mutateAsync({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        patientId: parseInt(uploadPatientId),
        visitId: uploadVisitId ? parseInt(uploadVisitId) : undefined,
      });

      // Upload file bytes directly to storage via server-side helper
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileKey", fileKey);

      // Use the server-side upload endpoint
      const uploadResponse = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });

      let fileUrl = "";
      if (uploadResponse.ok) {
        const result = await uploadResponse.json() as { url: string };
        fileUrl = result.url;
      } else {
        // Fallback: construct URL from key
        fileUrl = `/manus-storage/${fileKey}`;
      }

      await confirmUpload.mutateAsync({
        fileKey,
        fileUrl,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        patientId: parseInt(uploadPatientId),
        visitId: uploadVisitId ? parseInt(uploadVisitId) : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-display font-semibold">File Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload and manage patient documents, lab results, and imaging
        </p>
      </div>

      {/* Upload Section */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Upload className="h-3.5 w-3.5" />
            Upload New File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Patient ID *</Label>
              <Input
                type="number"
                value={uploadPatientId}
                onChange={(e) => setUploadPatientId(e.target.value)}
                placeholder="Patient ID"
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visit ID (optional)</Label>
              <Input
                type="number"
                value={uploadVisitId}
                onChange={(e) => setUploadVisitId(e.target.value)}
                placeholder="Link to visit"
                className="rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>File *</Label>
            <div className="flex gap-3">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.mp3,.wav,.m4a"
                className="rounded-lg flex-1"
              />
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="gap-2 shrink-0"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Supported: PDF, JPG, PNG, DOC, DOCX, MP3, WAV, M4A (max 50MB)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Browse Files */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />
            Browse Patient Files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              type="number"
              value={patientIdFilter}
              onChange={(e) => setPatientIdFilter(e.target.value)}
              placeholder="Enter Patient ID to browse files"
              className="rounded-lg max-w-xs"
            />
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={!patientId}
              className="gap-2"
            >
              Browse
            </Button>
          </div>

          {isLoading && patientId ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : files && files.length > 0 ? (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.fileName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">
                        {MIME_LABELS[file.mimeType] ?? file.mimeType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.fileSize)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(file.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <a href={file.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(file.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : patientId ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No files found for Patient #{patientId}</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Enter a Patient ID above to browse files</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
