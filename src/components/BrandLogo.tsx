type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  alt?: string;
};

export function BrandLogo({
  className,
  imageClassName,
  alt = "PepsiCo",
}: BrandLogoProps) {
  return (
    <div className={className}>
      <img src="/img/pep-logo.png" alt={alt} className={imageClassName} />
    </div>
  );
}
