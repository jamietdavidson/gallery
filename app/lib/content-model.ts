/**
 * The Long Look content model — Shopify Metaobjects on qdgy1c-iu.myshopify.com
 *
 * Relationships:
 *   Tag ──┬── Artist (0..n tags)
 *         ├── Collection (0..n tags)
 *         └── Picture (0..n tags)
 *
 *   Artist ──< Picture (required; each picture belongs to exactly one artist)
 *
 *   Collection >──< Picture (many-to-many; a picture may belong to 0+ collections)
 *
 *   Product ── Picture (optional; link a sellable print when the picture is for sale)
 *
 * Manage entries in Shopify Admin → Content → Metaobjects.
 */

/** Storefront / Admin metaobject type handles */
export const CONTENT_TYPES = {
  tag: 'tag',
  artist: 'artist',
  collection: 'collection',
  picture: 'picture',
} as const;

export type ContentType = (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES];

export interface Tag {
  id: string;
  handle: string;
  label: string;
}

export interface Artist {
  id: string;
  handle: string;
  name: string;
  airtableRecordId?: string | null;
  bio?: string | null;
  birthYear?: number | null;
  location?: string | null;
  portrait?: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  instagramHandle?: string | null;
  tags: Tag[];
  /** Resolved from metaobjects(type: "picture") filtered by artist */
  pictures?: Picture[];
}

export interface Collection {
  id: string;
  handle: string;
  title: string;
  airtableRecordId?: string | null;
  description?: string | null;
  coverImage?: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  tags: Tag[];
  /** Resolved from metaobjects(type: "picture") filtered by collections */
  pictures?: Picture[];
}

export interface Picture {
  id: string;
  handle: string;
  title: string;
  description?: string | null;
  image: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  };
  artist: Artist;
  collections: Collection[];
  tags: Tag[];
  product?: {
    id: string;
    handle: string;
    title: string;
    priceRange?: {minVariantPrice: {amount: string; currencyCode: string}};
  } | null;
}

/** Field keys on each metaobject definition (must match Shopify Admin schema). */
export const CONTENT_FIELDS = {
  tag: {
    label: 'label',
  },
  artist: {
    name: 'name',
    bio: 'bio',
    birthYear: 'birth_year',
    location: 'location',
    portrait: 'portrait',
    portraitSourceId: 'portrait_source_id',
    instagramHandle: 'instagram_handle',
    tags: 'tags',
    airtableRecordId: 'airtable_record_id',
  },
  collection: {
    title: 'title',
    description: 'description',
    coverImage: 'cover_image',
    tags: 'tags',
    airtableRecordId: 'airtable_record_id',
  },
  picture: {
    title: 'title',
    image: 'image',
    description: 'description',
    artist: 'artist',
    collections: 'collections',
    tags: 'tags',
    product: 'product',
    airtableRecordId: 'airtable_record_id',
  },
} as const;
