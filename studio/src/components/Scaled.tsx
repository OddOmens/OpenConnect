import type { App, DeviceId, Slide } from '../shared/types';
import { canvasSize } from '../shared/devices';
import { SlideView } from '../render/SlideView';

/** A native-resolution slide scaled down to a target height. */
export function Scaled({ app, slide, device, height, editing }: { app: App; slide: Slide; device: DeviceId; height: number; editing?: boolean }) {
  const [W, H] = canvasSize(app, device);
  const s = height / H;
  return (
    <div className="scaled" style={{ width: Math.round(W * s), height }}>
      <div style={{ width: W, height: H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
        <SlideView app={app} slide={slide} device={device} editing={editing} />
      </div>
    </div>
  );
}
