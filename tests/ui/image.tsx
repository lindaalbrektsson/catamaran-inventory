import type { ImgHTMLAttributes } from 'react';
export default function Image({
  unoptimized,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) {
  void unoptimized;
  // Isolated fixture adapter; production uses Next Image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ''} />;
}
