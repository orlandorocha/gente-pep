import pepLogo from "../../img/pep-logo.png";

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
      <img src={pepLogo} alt={alt} className={imageClassName} />
    </div>
  );
}