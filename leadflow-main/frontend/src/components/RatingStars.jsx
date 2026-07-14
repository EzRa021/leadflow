import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// Stitch rating: five amber stars, filled up to the (rounded) score.
// score is a 0–5 number (lead.total_score from Google Maps). Renders an em
// dash when there's no score.
export default function RatingStars({ score, reviews, className }) {
  if (score == null) return <span className="text-muted-text text-body-sm">—</span>;
  const filled = Math.round(Number(score) || 0);
  return (
    <div
      className={cn("flex items-center gap-0.5 text-amber-warning", className)}
      title={reviews != null ? `${score} (${reviews} reviews)` : String(score)}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name="star" fill={i < filled} className="text-sm" />
      ))}
    </div>
  );
}
