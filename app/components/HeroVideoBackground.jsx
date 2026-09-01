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

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.controls = false;

    const ensurePlaying = () => {
      video.playbackRate = playbackRate;
      if (video.paused) {
        void video.play().catch(() => {});
      }
    };

    ensurePlaying();
    video.addEventListener('loadedmetadata', ensurePlaying);
    video.addEventListener('canplay', ensurePlaying);

    const onVisibilityChange = () => {
      if (!document.hidden) ensurePlaying();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      video.removeEventListener('loadedmetadata', ensurePlaying);
      video.removeEventListener('canplay', ensurePlaying);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [playbackRate, src]);

  return (
    <video
      key={src}
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
      preload="auto"
      tabIndex={-1}
      className={cn(
        'hero-video-background pointer-events-none absolute inset-0 h-full w-full object-cover',
        className,
      )}
      aria-hidden="true"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
