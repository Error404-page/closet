export type Category = '上衣' | '外套' | '套装' | '裙子' | '裤子';

export interface WardrobeAsset {
  id: string;
  category: Category;
  name: string;
  thumbSrc: string;
  imageSrc: string;
}

export interface ManifestPayload {
  generatedAt: string;
  assets: WardrobeAsset[];
}

export interface CanvasItem {
  id: string;
  assetId: string;
  category: Category;
  src: string;
  thumbSrc: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface Outfit {
  outfitId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  previewImage: string;
  items: CanvasItem[];
}
