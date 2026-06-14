import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Eye, Copy, Trash2, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import PitchTag from "@/components/PitchTag";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  pitch_type: z.enum(["POS", "WEBSITE", "GENERIC", "CUSTOM"]),
  body: z.string().min(10, "Message must be at least 10 characters"),
  is_default: z.boolean().optional(),
});

const SAMPLE_LEAD = {
  name: "Jane's Boutique",
  company: "Jane's Boutique",
  email: "hello@janesboutique.com",
  phone: "08012345678",
};

const VARIABLES = ["{{name}}", "{{company}}", "{{email}}", "{{phone}}"];

const DEFAULT_VALUES = { name: "", pitch_type: "GENERIC", body: "", is_default: false };

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [previewText, setPreviewText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });

  const templates = data?.data || [];

  const form = useForm({
    resolver: zodResolver(templateSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const saveMutation = useMutation({
    mutationFn: (values) =>
      editing ? api.updateTemplate(editing.id, values) : api.createTemplate(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ variant: "success", title: editing ? "Template updated" : "Template created" });
      closeEditor();
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Save failed", description: err.body?.error || err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteTemplate,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      if (editing?.id === id) closeEditor();
      toast({ variant: "success", title: "Template deleted" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Delete failed", description: err.body?.error || err.message });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: api.duplicateTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ variant: "success", title: "Template duplicated" });
    },
  });

  const previewMutation = useMutation({
    mutationFn: ({ body }) => api.previewTemplate(body, SAMPLE_LEAD),
    onSuccess: (res) => {
      setPreviewText(res.rendered);
      setShowPreview(true);
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset(DEFAULT_VALUES);
  };

  const openEdit = (template) => {
    setEditing(template);
    form.reset({
      name: template.name,
      pitch_type: template.pitch_type,
      body: template.body,
      is_default: template.is_default,
    });
  };

  const closeEditor = () => {
    setEditing(null);
    form.reset(DEFAULT_VALUES);
  };

  const insertVariable = (variable) => {
    const current = form.getValues("body") || "";
    form.setValue("body", current + variable, { shouldDirty: true, shouldValidate: true });
  };

  const onSubmit = form.handleSubmit((values) => saveMutation.mutate(values));
  const bodyValue = form.watch("body");

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink leading-none">Message Templates</h2>
          <p className="text-sm text-ink-muted mt-1">Create and manage outreach templates with dynamic variables</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> New Template
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Template list */}
        <Card className="lg:col-span-2 self-start">
          <CardHeader className="pb-3">
            <CardTitle>Your Templates</CardTitle>
            <CardDescription>{templates.length} saved</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 px-5 pb-5">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="rounded-full border border-line bg-surface-2 p-4 mb-3">
                  <FileText className="h-6 w-6 text-ink-muted" />
                </div>
                <p className="font-semibold text-ink">No templates yet</p>
                <p className="text-sm text-ink-muted mt-1 mb-4">Create your first outreach template</p>
                <Button variant="outline" size="sm" onClick={openCreate}>Create template</Button>
              </div>
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-start justify-between gap-3 px-5 py-4 transition-colors cursor-pointer",
                      editing?.id === t.id ? "bg-teal/5" : "hover:bg-surface-2/50"
                    )}
                    onClick={() => openEdit(t)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{t.name}</p>
                        {t.is_default && <Badge variant="success">Default</Badge>}
                      </div>
                      <div className="mt-1.5">
                        <PitchTag pitchType={t.pitch_type} />
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-ink-muted">{t.body}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Duplicate"
                        onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(t.id); }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {!t.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-rose hover:text-rose hover:bg-rose/10"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete template "${t.name}"?`)) deleteMutation.mutate(t.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="lg:col-span-3 self-start">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{editing ? `Edit "${editing.name}"` : "Message Builder"}</CardTitle>
                <CardDescription className="mt-1">Use variables to personalize each message</CardDescription>
              </div>
              {editing && (
                <Button variant="ghost" size="sm" onClick={closeEditor}>
                  <X className="h-3.5 w-3.5" /> New
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="template-name">Template name</Label>
                  <Input id="template-name" {...form.register("name")} placeholder="e.g. POS intro pitch" />
                  {form.formState.errors.name && (
                    <p className="text-xs text-rose">{form.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Pitch type</Label>
                  <Controller
                    control={form.control}
                    name="pitch_type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select pitch type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="POS">POS</SelectItem>
                          <SelectItem value="WEBSITE">Website</SelectItem>
                          <SelectItem value="GENERIC">General</SelectItem>
                          <SelectItem value="CUSTOM">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="template-body">Message body</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="rounded border border-line px-2 py-0.5 font-mono text-[10px] text-teal hover:bg-teal/10 hover:border-teal/30 transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea
                  id="template-body"
                  {...form.register("body")}
                  rows={10}
                  placeholder="Hi {{name}}, I noticed {{company}}..."
                  className="font-mono text-xs leading-relaxed"
                />
                {form.formState.errors.body && (
                  <p className="text-xs text-rose">{form.formState.errors.body.message}</p>
                )}
              </div>

              <Controller
                control={form.control}
                name="is_default"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    Set as default for this pitch type
                  </label>
                )}
              />

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : editing ? "Update Template" : "Save Template"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => previewMutation.mutate({ body: bodyValue })}
                  disabled={!bodyValue?.trim() || previewMutation.isPending}
                >
                  <Eye className="h-4 w-4" /> Preview
                </Button>
                {editing && (
                  <Button type="button" variant="ghost" onClick={closeEditor}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
            <DialogDescription>Rendered with sample lead data</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-2">
            <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-4 font-mono text-xs leading-relaxed text-ink">
              {previewText}
            </pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
