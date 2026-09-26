export type CatalogTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  primaryGenre?: string;
  year?: string | null;
  previewUrl?: string | null;
  tags?: string[];
};

export type CatalogArtist = {
  name: string;
  albums: string[];
  relatedGenres: string[];
};

export type CatalogAlbum = {
  name: string;
  artist: string;
  year?: string | null;
};

export type GenreBucket = {
  artists: CatalogArtist[];
  albums: CatalogAlbum[];
  tracks: CatalogTrack[];
  moodHints?: string[];
  eraHints?: string[];
  regionHints?: string[];
};

export type MusicCatalog = {
  asOf: string;
  source: string;
  moods: string[];
  eras: string[];
  regions: string[];
  genres: Record<string, GenreBucket>;
  musicBrainzNote?: string;
  liveRefreshed?: boolean;
  liveNote?: string;
};

export type TasteProfile = {
  genres: string[];
  mood?: string;
  era?: string;
  region?: string;
  artists: string[];
  albums: string[];
};

export type TrackPick = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: string | null;
  genre?: string;
  why: string;
  previewUrl?: string | null;
};
