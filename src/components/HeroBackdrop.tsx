import Image from "next/image";

/**
 * The hero photo, its fades, and the slow push-in. The photo starts below
 * the top of the section and is anchored to its own top edge, so the
 * fighter's head always clears the site bar; the crop trims the floor,
 * never the head.
 */
export function HeroBackdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="animate-hero-drift absolute inset-x-0 top-[12svh] -bottom-[12svh] -z-20 origin-[75%_20%]"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 7%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 7%)",
        }}
      >
        <Image
          src="/avatars/hero2.jpg"
          alt=""
          fill
          priority
          quality={80}
          sizes="100vw"
          className="object-cover object-[76%_top] brightness-[1.12] sm:object-[70%_top]"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-t from-canvas via-canvas/55 to-transparent sm:bg-gradient-to-r sm:from-canvas/90 sm:via-canvas/35 sm:to-transparent"
      />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/4 bg-gradient-to-t from-canvas to-transparent" />
    </>
  );
}
