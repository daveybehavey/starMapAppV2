"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

type ResilientImageProps = ImageProps & {
  fallbackSrc: string;
};

export default function ResilientImage({ src, fallbackSrc, alt, ...props }: ResilientImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);

  return (
    <Image
      {...props}
      src={currentSrc}
      alt={alt}
      onError={() => {
        if (currentSrc === fallbackSrc) return;
        setCurrentSrc(fallbackSrc);
      }}
    />
  );
}
