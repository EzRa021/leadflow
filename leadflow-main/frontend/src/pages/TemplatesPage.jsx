import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/lib/use-toast";
import PitchTag from "@/components/PitchTag";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  pitch_type: z.enum(["POS", "WEBSITE", "GENERIC", "CUSTOM"]),
  body: z.string().min(10, "Message must be at least 10 characters"),
  is_default: z.boolean().optional(),
});

const SAMPLE_LEAD = {
  name: "Jane's Boutique", company: "Jane's Boutique", email: "hello@janesboutique.com",
  phone: "08012345678", city: "Lagos", state: "Lagos", category: "Boutique",
  total_score: 4.6, reviews_count: 128,
};

const VARIABLES = ["{{name}}", "{{company}}", "{{email}}", "{{phone}}", "{{city}}", "{{state}}", "{{category}}", "{{rating}}", "{{reviews_count}}"];
const DEFAULT_VALUES = { name: "", pitch_type: "GENERIC", body: "", is_default: false };

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [previewText, setPreviewText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["templates"], queryFn: () => api.getTemplates() });
  const templates = data?.data || [];

  const form = useForm({ resolver: zodResolver(templateSchema), defaultValues: DEFAULT_VALUES });

  const saveMutation = useMutation({
    mutationFn: (values) => (editing ? api.updateTemplate(editing.id, values) : api.createTemplate(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ variant: "success", title: editing ? "Template updated" : "Template created" });
      closeEditor();
    },
    onError: (err) => toast({ variant: "destructive", title: "Save failed", description: err.body?.error || err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteTemplate,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      if (editing?.id === id) closeEditor();
      toast({ variant: "success", title: "Template deleted" });
    },
    onError: (err) => toast({ variant: "destructive", title: "Delete failed", description: err.body?.error || err.message }),
  });

  const duplicateMutation = useMutation({
    mutationFn: api.duplicateTemplate,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); toast({ variant: "success", title: "Template duplicated" }); },
    onError: (err) => toast({ variant: "destructive", title: "Duplicate failed", description: err.body?.error || err.message }),
  });

  const previewMutation = useMutation({
    mutationFn: ({ body }) => api.previewTemplate(body, SAMPLE_LEAD),
    onSuccess: (res) => { setPreviewText(res.rendered); setShowPreview(true); },
    onError: (err) => toast({ variant: "destructive", title: "Preview failed", description: err.body?.error || err.message }),
  });

  const openCreate = () => { setEditing(null); form.reset(DEFAULT_VALUES); };
  const openEdit = (t) => { setEditing(t); form.reset({ name: t.name, pitch_type: t.pitch_type, body: t.body, is_default: t.is_default }); };
  const closeEditor = () => { setEditing(null); form.reset(DEFAULT_VALUES); };
  const insertVariable = (v) => form.setValue("body", (form.getValues("body") || "") + v, { shouldDirty: true, shouldValidate: true });
  const onSubmit = form.handleSubmit((values) => saveMutation.mutate(values));
  const bodyValue = form.watch("body");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Message Templates</h2>
          <p className="text-muted-text text-body-sm mt-1">Create and manage outreach templates with dynamic variables.</p>
        </div>
        <Button onClick={openCreate}><Icon name="add" className="text-lg" /> New Template</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Template list */}
        <div className="lg:col-span-2 self-start bg-surface border border-outline-variant">
          <div className="p-4 border-b border-outline-variant">
            <h3 className="font-headline-md text-headline-md text-on-surface">Your Templates</h3>
            <p className="text-body-sm text-muted-text">{templates.length} saved</p>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <Icon name="description" className="text-4xl text-muted-text" />
              <p className="font-semibold text-on-surface mt-3">No templates yet</p>
              <p className="text-body-sm text-muted-text mt-1 mb-4">Create your first outreach template</p>
              <Button variant="outline" size="sm" onClick={openCreate}>Create template</Button>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => openEdit(t)}
                  className={cn("flex items-start justify-between gap-3 px-4 py-3.5 cursor-pointer transition-colors", editing?.id === t.id ? "bg-teal-accent/5" : "hover:bg-surface-container-high")}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-md font-medium text-on-surface">{t.name}</p>
                      {t.is_default && <span className="text-[10px] uppercase tracking-wider text-teal-accent bg-teal-accent/10 border border-teal-accent/20 px-1.5 py-0.5">Default</span>}
                    </div>
                    <div className="mt-1.5"><PitchTag pitchType={t.pitch_type} /></div>
                    <p className="mt-2 line-clamp-2 text-[11px] text-muted-text">{t.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(t.id); }} className="p-1.5 text-muted-text hover:text-on-surface transition-colors">
                      <Icon name="content_copy" className="text-base" />
                    </button>
                    {!t.is_default && (
                      <button title="Delete" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete template "${t.name}"?`)) deleteMutation.mutate(t.id); }} className="p-1.5 text-rose hover:bg-rose/10 transition-colors">
                        <Icon name="delete" className="text-base" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="lg:col-span-3 self-start bg-surface border border-outline-variant">
          <div className="p-4 border-b border-outline-variant flex items-center justify-between gap-3">
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">{editing ? `Edit "${editing.name}"` : "Message Builder"}</h3>
              <p className="text-body-sm text-muted-text mt-0.5">Use variables to personalize each message</p>
            </div>
            {editing && <Button variant="ghost" size="sm" onClick={closeEditor}><Icon name="close" className="text-base" /> New</Button>}
          </div>
          <form onSubmit={onSubmit} className="p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="template-name">Template name</Label>
                <Input id="template-name" {...form.register("name")} placeholder="e.g. POS intro pitch" className="bg-surface-container-lowest border-outline-variant" />
                {form.formState.errors.name && <p className="text-[11px] text-rose">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Pitch type</Label>
                <Controller
                  control={form.control} name="pitch_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="bg-surface-container-lowest border-outline-variant"><SelectValue placeholder="Select pitch type" /></SelectTrigger>
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
                    <button key={v} type="button" onClick={() => insertVariable(v)} className="border border-outline-variant px-2 py-0.5 font-mono text-[10px] text-teal-accent hover:bg-teal-accent/10 hover:border-teal-accent/30 transition-colors">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea id="template-body" {...form.register("body")} rows={10} placeholder="Hi {{name}}, I noticed {{company}}..." className="font-mono text-xs leading-relaxed bg-surface-container-lowest border-outline-variant" />
              {form.formState.errors.body && <p className="text-[11px] text-rose">{form.formState.errors.body.message}</p>}
            </div>

            <Controller
              control={form.control} name="is_default"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-body-sm text-muted-text cursor-pointer">
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} /> Set as default for this pitch type
                </label>
              )}
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : editing ? "Update Template" : "Save Template"}</Button>
              <Button type="button" variant="outline" onClick={() => previewMutation.mutate({ body: bodyValue })} disabled={!bodyValue?.trim() || previewMutation.isPending}>
                <Icon name="visibility" className="text-base" /> Preview
              </Button>
              {editing && <Button type="button" variant="ghost" onClick={closeEditor}>Cancel</Button>}
            </div>
          </form>
        </div>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
            <DialogDescription>Rendered with sample lead data</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-2">
            <pre className="whitespace-pre-wrap border border-outline-variant bg-surface-container-lowest p-4 font-mono text-xs leading-relaxed text-on-surface">{previewText}</pre>
          </div>
          <DialogFooter><Button onClick={() => setShowPreview(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
