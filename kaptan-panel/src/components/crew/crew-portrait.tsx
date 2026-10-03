import type { CrewMember } from "@/lib/crew";
import { portraitSrc, portraitSrcSet } from "@/lib/crew";
import { cn } from "@/lib/utils";

/**
 * A crew portrait (3:4, AVIF → WebP → JPEG). `sizes` should describe the rendered width so the
 * browser picks 400/600/800. Decorative by default (the name is always printed next to it).
 */
export function CrewPortrait({
  member,
  sizes = "200px",
  priority = false,
  className,
  alt = "",
}: {
  member: CrewMember;
  sizes?: string;
  priority?: boolean;
  className?: string;
  alt?: string;
}) {
  return (
    <picture className={cn("block aspect-[3/4] overflow-hidden bg-wash-tint", className)}>
      <source type="image/avif" srcSet={portraitSrcSet(member, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={portraitSrcSet(member, "webp")} sizes={sizes} />
      <img
        src={portraitSrc(member)}
        srcSet={portraitSrcSet(member, "jpg")}
        sizes={sizes}
        width={400}
        height={533}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="size-full object-cover grayscale-[15%]"
      />
    </picture>
  );
}
