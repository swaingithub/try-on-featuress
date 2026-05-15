import dotenv from 'dotenv';
dotenv.config();

const shopifyEndpoint = `https://${process.env.SHOP_DOMAIN}/api/2023-10/graphql.json`;
const shopifyHeaders = {
  'Content-Type': 'application/json',
  'X-Shopify-Storefront-Access-Token': process.env.STOREFRONT_ACCESS_TOKEN,
};

function formatProduct(node) {
  const variants = node?.variants?.edges || [];
  const priceV2 = variants[0]?.node?.priceV2 || {};
  const compareAtPriceV2 = variants[0]?.node?.compareAtPriceV2 || {};
  const images = (node?.images?.edges || []).map((img) => ({
    id: img?.node?.id || null,
    originalSrc: img?.node?.originalSrc || null,
  }));
  const tags = node?.tags || [];

  return {
    id: node?.id || null,
    title: node?.title || 'Unknown Title',
    handle: node?.handle || '',
    description: node?.description || 'No Description',
    price: priceV2?.amount || null,
    compareAtPrice: compareAtPriceV2?.amount || null,
    currencyCode: priceV2?.currencyCode || null,
    images,
    tags,
    isFeatured: tags.includes('trending') || tags.includes('featured') || tags.length > 0,
  };
}

export async function fetchAllProducts(first = 20) {
  const query = `
    query getAllProducts($first: Int) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            description
            tags
            variants(first: 1) {
              edges {
                node {
                  priceV2 { amount currencyCode }
                  compareAtPriceV2 { amount currencyCode }
                }
              }
            }
            images(first: 5) {
              edges {
                node { id originalSrc }
              }
            }
          }
        }
      }
    }
  `;

  try {
    console.log(`[productService] Fetching ${first} products...`);
    const response = await fetch(shopifyEndpoint, {
      method: 'POST',
      headers: shopifyHeaders,
      body: JSON.stringify({ query, variables: { first } }),
    });
    const data = await response.json();
    if (data.errors) {
      console.error('[productService] Shopify Errors:', JSON.stringify(data.errors, null, 2));
      return [];
    }
    return (data?.data?.products?.edges || []).map((edge) => formatProduct(edge.node));
  } catch (error) {
    console.error('[productService] Fetch products error:', error.message);
    return [];
  }
}

export async function fetchAllCollections(first = 20) {
  const query = `
    query getCollections($first: Int) {
      collections(first: $first) {
        edges {
          node {
            id
            title
            handle
            description
          }
        }
      }
    }
  `;

  try {
    console.log(`[productService] Fetching ${first} collections...`);
    const response = await fetch(shopifyEndpoint, {
      method: 'POST',
      headers: shopifyHeaders,
      body: JSON.stringify({ query, variables: { first } }),
    });
    const data = await response.json();
    if (data.errors) {
      console.error('[productService] Shopify Errors (Collections):', JSON.stringify(data.errors, null, 2));
      return [];
    }
    return (data?.data?.collections?.edges || []).map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      description: edge.node.description,
    }));
  } catch (error) {
    console.error('[productService] Fetch collections error:', error.message);
    return [];
  }
}
