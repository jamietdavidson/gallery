import {useEffect, useRef} from 'react';
import {cn} from '~/lib/utils';

const HERO_VIDEO_SRC = '/First TLL Reel (Landscape).mp4';
const HERO_VIDEO_PLAYBACK_RATE = 0.35;

/** @param {{className?: string}} */
export function HeroVideoBackground({className}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const applyPlaybackRate = () => {
      video.playbackRate = HERO_VIDEO_PLAYBACK_RATE;
    };

    applyPlaybackRate();
    video.addEventListener('loadedmetadata', applyPlaybackRate);
    return () => video.removeEventListener('loadedmetadata', applyPlaybackRate);
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      className={cn('absolute inset-0 h-full w-full object-cover', className)}
      aria-hidden="true"
    >
      <source src={HERO_VIDEO_SRC} type="video/mp4" />
    </video>
  );
}
