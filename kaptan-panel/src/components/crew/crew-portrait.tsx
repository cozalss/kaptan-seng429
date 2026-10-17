import type { CrewMember } from "@/lib/crew";
import { PORTRAIT_WIDTHS, portraitSrc, portraitSrcSet } from "@/lib/crew";
import { cn } from "@/lib/utils";

/**
 * A crew portrait (3:4, AVIF → WebP → JPEG). `sizes` should describe the rendered width so the
 * browser picks the right cut; pass `widths={LOG_PORTRAIT_WIDTHS}` for the 44px log portraits.
 * Decorative by default (the name is always printed next to it).
 */
export function CrewPortrait({
  member,
  sizes = "200px",
  widths = PORTRAIT_WIDTHS,
  priority = false,
  className,
  alt = "",
}: {
  member: CrewMember;
  sizes?: string;
  widths?: readonly number[];
  priority?: boolean;
  className?: string;
  alt?: string;
}) {
  return (
    <picture className={cn("block aspect-[3/4] overflow-hidden bg-wash-tint", className)}>
      <source type="image/avif" srcSet={portraitSrcSet(member, "avif", widths)} sizes={sizes} />
      <source type="image/webp" srcSet={portraitSrcSet(member, "webp", widths)} sizes={sizes} />
      <img
        src={portraitSrc(member)}
        srcSet={portraitSrcSet(member, "jpg", widths)}
        sizes={sizes}
        width={400}
        height={533}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="size-full object-cover"
      />
    </picture>
  );
}
