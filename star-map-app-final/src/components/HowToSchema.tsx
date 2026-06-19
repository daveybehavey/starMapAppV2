type HowToStep = {
  name: string;
  text: string;
  url?: string;
};

type HowToSchemaProps = {
  name: string;
  description: string;
  steps: HowToStep[];
  /** ISO 8601 duration, e.g. PT5M for five minutes */
  totalTime?: string;
};

export default function HowToSchema({ name, description, steps, totalTime }: HowToSchemaProps) {
  if (!steps.length) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    ...(totalTime ? { totalTime } : {}),
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.url ? { url: step.url } : {}),
    })),
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}
