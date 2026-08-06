import {HeroVideoBackground} from '~/components/HeroVideoBackground';

export function Hero() {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      <HeroVideoBackground className="scale-105" />
    </section>
  );
}
