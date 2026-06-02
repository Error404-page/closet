import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Edit3,
  ImagePlus,
  Layers,
  Maximize2,
  MoveUp,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { deleteOutfit, getOutfits, saveOutfit } from './storage';
import type { CanvasItem, Category, ManifestPayload, Outfit, WardrobeAsset } from './types';
import './styles.css';

const CATEGORIES: Category[] = ['上衣', '外套', '套装', '裙子', '裤子'];

type DragAction =
  | { kind: 'move'; id: string; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'resize'; id: string; startX: number; startY: number; originWidth: number; originHeight: number }
  | { kind: 'rotate'; id: string };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function defaultSize(category: Category) {
  const sizes: Record<Category, { width: number; height: number }> = {
    上衣: { width: 36, height: 22 },
    外套: { width: 44, height: 32 },
    套装: { width: 46, height: 35 },
    裙子: { width: 42, height: 31 },
    裤子: { width: 36, height: 34 },
  };
  return sizes[category];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function renderPreview(items: CanvasItem[]) {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#fff7fb');
  gradient.addColorStop(0.55, '#fff0f6');
  gradient.addColorStop(1, '#f7f2ff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const item of [...items].sort((a, b) => a.zIndex - b.zIndex)) {
    const image = await loadImage(item.src);
    const x = (item.x / 100) * canvas.width;
    const y = (item.y / 100) * canvas.height;
    const width = (item.width / 100) * canvas.width;
    const height = (item.height / 100) * canvas.height;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  return canvas.toDataURL('image/png', 0.92);
}

export default function App() {
  const [assets, setAssets] = useState<WardrobeAsset[]>([]);
  const [assetError, setAssetError] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('上衣');
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('今日粉粉搭配');
  const [status, setStatus] = useState('');
  const [action, setAction] = useState<DragAction | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const filteredAssets = useMemo(() => assets.filter((asset) => asset.category === activeCategory), [assets, activeCategory]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}assets/asset-manifest.json`)
      .then((response) => {
        if (!response.ok) throw new Error('asset manifest missing');
        return response.json() as Promise<ManifestPayload>;
      })
      .then((payload) => setAssets(payload.assets))
      .catch(() => setAssetError('还没有生成素材清单，请先运行 npm run prepare:assets。'));
  }, []);

  useEffect(() => {
    refreshOutfits();
  }, []);

  useEffect(() => {
    if (!action) return;

    const handleMove = (event: globalThis.PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      setItems((current) =>
        current.map((item) => {
          if (item.id !== action.id) return item;

          if (action.kind === 'move') {
            const deltaX = ((event.clientX - action.startX) / rect.width) * 100;
            const deltaY = ((event.clientY - action.startY) / rect.height) * 100;
            return { ...item, x: clamp(action.originX + deltaX, -15, 115), y: clamp(action.originY + deltaY, -15, 115) };
          }

          if (action.kind === 'resize') {
            const deltaX = ((event.clientX - action.startX) / rect.width) * 100;
            const deltaY = ((event.clientY - action.startY) / rect.height) * 100;
            return {
              ...item,
              width: clamp(action.originWidth + deltaX, 10, 95),
              height: clamp(action.originHeight + deltaY, 8, 95),
            };
          }

          const centerX = rect.left + (item.x / 100) * rect.width;
          const centerY = rect.top + (item.y / 100) * rect.height;
          const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI + 90;
          return { ...item, rotation: Math.round(angle) };
        }),
      );
    };

    const handleUp = () => setAction(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [action]);

  async function refreshOutfits() {
    setOutfits(await getOutfits());
  }

  function addAsset(asset: WardrobeAsset, point?: { x: number; y: number }) {
    const size = defaultSize(asset.category);
    const nextZ = items.length ? Math.max(...items.map((item) => item.zIndex)) + 1 : 1;
    const item: CanvasItem = {
      id: makeId('item'),
      assetId: asset.id,
      category: asset.category,
      src: asset.imageSrc,
      thumbSrc: asset.thumbSrc,
      name: asset.name,
      x: point?.x ?? 50 + ((items.length % 5) - 2) * 3,
      y: point?.y ?? 48 + (items.length % 4) * 4,
      width: size.width,
      height: size.height,
      rotation: 0,
      zIndex: nextZ,
    };
    setItems((current) => [...current, item]);
    setSelectedId(item.id);
    setStatus(`${asset.name} 已加入画板`);
  }

  function updateSelected(patch: Partial<CanvasItem>) {
    if (!selectedId) return;
    setItems((current) => current.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)));
  }

  function removeSelected() {
    if (!selectedId) return;
    setItems((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function moveLayer(direction: 'up' | 'down') {
    if (!selectedId) return;
    setItems((current) =>
      current.map((item) => (item.id === selectedId ? { ...item, zIndex: clamp(item.zIndex + (direction === 'up' ? 1 : -1), 1, 999) } : item)),
    );
  }

  function bringToFront() {
    if (!selectedId) return;
    setItems((current) => {
      const nextZ = current.length ? Math.max(...current.map((item) => item.zIndex)) + 1 : 1;
      return current.map((item) => (item.id === selectedId ? { ...item, zIndex: nextZ } : item));
    });
  }

  function clearCanvas() {
    setItems([]);
    setSelectedId(null);
    setEditingId(null);
    setTitle('今日粉粉搭配');
    setStatus('画板已清空');
  }

  async function saveCurrentOutfit() {
    if (!items.length) {
      setStatus('先添加几件衣服再保存');
      return;
    }
    setStatus('正在生成预览...');
    const now = new Date().toISOString();
    const existing = outfits.find((outfit) => outfit.outfitId === editingId);
    const outfit: Outfit = {
      outfitId: editingId ?? makeId('outfit'),
      title: title.trim() || '未命名搭配',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      previewImage: await renderPreview(items),
      items,
    };

    await saveOutfit(outfit);
    setEditingId(outfit.outfitId);
    await refreshOutfits();
    setStatus('已保存到橱窗');
  }

  function editOutfit(outfit: Outfit) {
    setEditingId(outfit.outfitId);
    setTitle(outfit.title);
    setItems(outfit.items);
    setSelectedId(outfit.items.at(-1)?.id ?? null);
    setStatus(`正在编辑：${outfit.title}`);
  }

  async function duplicateOutfit(outfit: Outfit) {
    const now = new Date().toISOString();
    await saveOutfit({
      ...outfit,
      outfitId: makeId('outfit'),
      title: `${outfit.title} 副本`,
      createdAt: now,
      updatedAt: now,
      items: outfit.items.map((item) => ({ ...item, id: makeId('item') })),
    });
    await refreshOutfits();
    setStatus('已复制搭配');
  }

  async function removeOutfit(outfitId: string) {
    await deleteOutfit(outfitId);
    if (editingId === outfitId) clearCanvas();
    await refreshOutfits();
    setStatus('已从橱窗删除');
  }

  function downloadPreview(outfit: Outfit) {
    const link = document.createElement('a');
    link.href = outfit.previewImage;
    link.download = `${outfit.title}.png`;
    link.click();
  }

  function handleItemPointerDown(event: ReactPointerEvent<HTMLDivElement>, item: CanvasItem) {
    if ((event.target as HTMLElement).closest('button, input, .resize-handle, .rotate-handle')) return;
    setSelectedId(item.id);
    setAction({ kind: 'move', id: item.id, startX: event.clientX, startY: event.clientY, originX: item.x, originY: item.y });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const assetId = event.dataTransfer.getData('text/plain');
    const asset = assets.find((candidate) => candidate.id === assetId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!asset || !rect) return;
    addAsset(asset, {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">
            <Sparkles size={14} />
            粉粉电子衣橱
          </span>
          <h1>搭配你的今日衣橱</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={clearCanvas}>
            <X size={17} />
            新搭配
          </button>
          <button className="primary-button" type="button" onClick={saveCurrentOutfit}>
            <Save size={17} />
            保存
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel asset-panel" aria-label="素材列表">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">素材</span>
              <h2>衣服列表</h2>
            </div>
            <span className="count-pill">{assets.length}</span>
          </div>

          <div className="category-tabs" role="tablist" aria-label="衣服分类">
            {CATEGORIES.map((category) => (
              <button className={activeCategory === category ? 'tab active' : 'tab'} key={category} type="button" onClick={() => setActiveCategory(category)}>
                {category}
              </button>
            ))}
          </div>

          {assetError ? (
            <div className="empty-state">{assetError}</div>
          ) : (
            <div className="asset-grid">
              {filteredAssets.map((asset) => (
                <button
                  className="asset-card"
                  draggable
                  key={asset.id}
                  type="button"
                  title="点击加入，也可以拖到画板"
                  onClick={() => addAsset(asset)}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', asset.id)}
                >
                  <img src={asset.thumbSrc} alt={asset.name} loading="lazy" />
                  <span>{asset.name}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="stage-panel" aria-label="搭配画板">
          <div className="stage-toolbar">
            <input aria-label="搭配名称" value={title} onChange={(event) => setTitle(event.target.value)} />
            <div className="tool-buttons" aria-label="画板工具">
              <button type="button" title="逆时针旋转" disabled={!selectedItem} onClick={() => updateSelected({ rotation: (selectedItem?.rotation ?? 0) - 8 })}>
                <RotateCcw size={17} />
              </button>
              <button type="button" title="顺时针旋转" disabled={!selectedItem} onClick={() => updateSelected({ rotation: (selectedItem?.rotation ?? 0) + 8 })}>
                <RotateCw size={17} />
              </button>
              <button type="button" title="上移一层" disabled={!selectedItem} onClick={() => moveLayer('up')}>
                <ArrowUp size={17} />
              </button>
              <button type="button" title="置顶" disabled={!selectedItem} onClick={bringToFront}>
                <MoveUp size={17} />
              </button>
              <button type="button" title="下移一层" disabled={!selectedItem} onClick={() => moveLayer('down')}>
                <ArrowDown size={17} />
              </button>
              <button type="button" title="删除选中" disabled={!selectedItem} onClick={removeSelected}>
                <Trash2 size={17} />
              </button>
            </div>
          </div>

          <div className="canvas-wrap">
            <div
              className="closet-canvas"
              ref={canvasRef}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onPointerDown={(event) => {
                if (event.currentTarget === event.target) setSelectedId(null);
              }}
            >
              {!items.length && (
                <div className="canvas-empty">
                  <ImagePlus size={36} />
                  <span>点击素材或拖进这里开始搭配</span>
                </div>
              )}

              {[...items]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((item) => (
                  <div
                    className={selectedId === item.id ? 'canvas-item selected' : 'canvas-item'}
                    key={item.id}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: `${item.width}%`,
                      height: `${item.height}%`,
                      zIndex: item.zIndex,
                      transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                    }}
                    onPointerDown={(event) => handleItemPointerDown(event, item)}
                  >
                    <img src={item.src} alt={item.name} draggable={false} />
                    {selectedId === item.id && (
                      <>
                        <button className="item-delete" type="button" title="删除" onClick={removeSelected}>
                          <Trash2 size={14} />
                        </button>
                        <button className="front-handle" type="button" title="置顶" onClick={bringToFront}>
                          <MoveUp size={13} />
                        </button>
                        <button
                          className="rotate-handle"
                          type="button"
                          title="拖动旋转"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setAction({ kind: 'rotate', id: item.id });
                          }}
                        >
                          <RotateCw size={13} />
                        </button>
                        <button
                          className="resize-handle"
                          type="button"
                          title="拖动缩放"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setAction({
                              kind: 'resize',
                              id: item.id,
                              startX: event.clientX,
                              startY: event.clientY,
                              originWidth: item.width,
                              originHeight: item.height,
                            });
                          }}
                        >
                          <Maximize2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
            </div>
          </div>

          <div className="mobile-properties">
            <span>
              <Layers size={15} />
              {selectedItem ? selectedItem.name : '未选择素材'}
            </span>
            <input
              aria-label="缩放"
              disabled={!selectedItem}
              max={95}
              min={10}
              type="range"
              value={selectedItem?.width ?? 30}
              onChange={(event) => {
                const width = Number(event.target.value);
                updateSelected({ width, height: clamp(width * 0.78, 8, 95) });
              }}
            />
          </div>

          {status && <p className="status-line">{status}</p>}
        </section>

        <aside className="panel showcase-panel" aria-label="橱窗列表">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">橱窗</span>
              <h2>已保存搭配</h2>
            </div>
            <span className="count-pill">{outfits.length}</span>
          </div>

          {outfits.length ? (
            <div className="outfit-list">
              {outfits.map((outfit) => (
                <article className="outfit-card" key={outfit.outfitId}>
                  <button className="outfit-preview" type="button" onClick={() => editOutfit(outfit)} title="查看并编辑">
                    <img src={outfit.previewImage} alt={outfit.title} />
                  </button>
                  <div className="outfit-meta">
                    <div>
                      <strong>{outfit.title}</strong>
                      <span>{formatDate(outfit.updatedAt)}</span>
                    </div>
                    <div className="outfit-actions">
                      <button type="button" title="查看/编辑" onClick={() => editOutfit(outfit)}>
                        <Edit3 size={15} />
                      </button>
                      <button type="button" title="复制" onClick={() => duplicateOutfit(outfit)}>
                        <Copy size={15} />
                      </button>
                      <button type="button" title="下载预览图" onClick={() => downloadPreview(outfit)}>
                        <Download size={15} />
                      </button>
                      <button type="button" title="删除" onClick={() => removeOutfit(outfit.outfitId)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">保存后的搭配会出现在这里，可以再次编辑或删除。</div>
          )}
        </aside>
      </section>
    </main>
  );
}
