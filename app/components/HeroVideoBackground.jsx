import {useEffect, useRef} from 'react';
import {cn} from '~/lib/utils';

export const HERO_REEL_VIDEO_SRC = '/First TLL Reel (Landscape).mp4';
export const HERO_BANNER_VIDEO_SRC = '/website-banner-v1.mp4';

const DEFAULT_VIDEO_SRC = HERO_REEL_VIDEO_SRC;
const DEFAULT_PLAYBACK_RATE = 0.35;

/**
 * @param {{
 *   className?: string;
 *   src?: string;
 *   playbackRate?: number;
 * }}
 */
export function HeroVideoBackground({
  className,
  src = DEFAULT_VIDEO_SRC,
  playbackRate = DEFAULT_PLAYBACK_RATE,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const applyPlaybackRate = () => {
      video.playbackRate = playbackRate;
    };

    applyPlaybackRate();
    video.addEventListener('loadedmetadata', applyPlaybackRate);
    return () => video.removeEventListener('loadedmetadata', applyPlaybackRate);
  }, [playbackRate]);

  return (
    <video
      key={src}
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      className={cn('absolute inset-0 h-full w-full object-cover', className)}
      aria-hidden="true"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
