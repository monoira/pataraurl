type SEOProps = {
  title: string;
  description: string;
};

/**
 * SEO component to manage metadata for specific routes
 * @param title title of the specific route (required)
 * @param description description of the specific route (required)
 */
export default function SEO({ title, description }: SEOProps) {
  return (
    <>
      {/* || Standard metadata tags */}
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* || Facebook open graph tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />

      {/* || Twitter tags */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </>
  );
}
