import {
  HERO_BANNER_VIDEO_SRC,
  HeroVideoBackground,
} from '~/components/HeroVideoBackground';

export function Hero() {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      <HeroVideoBackground
        className="scale-105"
        src={HERO_BANNER_VIDEO_SRC}
        playbackRate={1}
      />
    </section>
  );
}
