import { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Upload, Download, Loader2, ArrowLeft, Copy, Wallet, Zap, Star, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";

const QUALITY_LABELS: Record<string, string> = {
  standard: "Standard",
  hd: "HD",
};

// Resolution options per quality tier (no pricing exposed to customer)
const RESOLUTION_OPTIONS: Record<string, { value: string; label: string; desc: string }[]> = {
  standard: [
    { value: "512",  label: "512 px",      desc: "Quick preview" },
    { value: "1024", label: "1024 × 1024", desc: "Standard" },
    { value: "2048", label: "2048 × 2048", desc: "High detail" },
    { value: "4096", label: "4096 × 4096", desc: "Ultra 4K" },
  ],
  hd: [
    { value: "1024", label: "1024 × 1024", desc: "HD" },
    { value: "2048", label: "2048 × 2048", desc: "High detail" },
    { value: "4096", label: "4096 × 4096", desc: "Ultra 4K" },
  ],
};

interface UploadZone {
  label: string;
  key: string;
  file: File | null;
  preview: string | null;
  optional?: boolean;
}

interface Logo {
  id: string;
  name: string;
  file_path: string;
  is_active: boolean;
}

const backdropOptions = [
  { value: "studio", label: "Studio" },
  { value: "wedding", label: "Wedding" },
  { value: "palace", label: "Palace" },
  { value: "park", label: "Park" },
  { value: "garden", label: "Garden" },
  { value: "temple", label: "Temple" },
  { value: "jharokha", label: "Jharokha (Window Arch)" },
  { value: "marble", label: "Marble Interior" },
  { value: "festive", label: "Festive Lights" },
  { value: "nature", label: "Nature Outdoors" },
  { value: "haveli", label: "Haveli Courtyard" },
  { value: "riverside", label: "Riverside Ghat" },
  { value: "vintage", label: "Vintage Furniture" },
  { value: "tropical", label: "Tropical Garden" },
  { value: "durbar", label: "Royal Durbar Hall" },
  { value: "silk-market", label: "Silk Road Market" },
  { value: "mountain-mist", label: "Mountain Mist" },
  { value: "rooftop-sunset", label: "Rooftop Sunset" },
  { value: "flower-field", label: "Flower Field" },
];

// Model is now selected by quality tier — no hardcoded model

const poseMatrix = [
  { value: "random-cinematic", label: "Random Cinematic Pose", prompt: "" },
  { value: "front-showcase", label: "Front Showcase Pose", prompt: "" },
  { value: "side-profile", label: "Side Profile Pose", prompt: "" },
  { value: "t-showcase", label: "T Showcase Pose", prompt: "" },
  { value: "elegance-personified", label: "Elegance Personified", prompt: "standing tall with perfect posture, chin slightly raised, one hand resting gracefully at waist, direct confident gaze into camera, full body visible" },
  { value: "jharokha-gaze", label: "The Jharokha Gaze", prompt: "standing beside an ornate window or archway, looking sideways through it with a dreamy expression, one hand resting on the frame, soft side lighting" },
  { value: "heritage-pillar", label: "Heritage Pillar", prompt: "standing beside a carved stone temple pillar, one hand resting lightly on it, body turned at 3/4 angle to camera, serene expression" },
  { value: "pallu-flow", label: "The Pallu Flow", prompt: "standing with arms slightly raised allowing the pallu to flow dramatically, slight breeze effect, looking down at the flowing fabric, full body visible" },
  { value: "monsoon-mist", label: "Monsoon Mist", prompt: "standing gracefully in a soft misty atmosphere, arms loosely at sides, looking gently away from camera, ethereal mood, full body" },
  { value: "urban-contrast", label: "Urban Contrast", prompt: "standing confidently against a modern minimalist backdrop, strong posture, arms crossed lightly, direct gaze, contemporary editorial feel" },
  { value: "golden-hour", label: "Golden Hour Solitude", prompt: "standing in warm golden backlight, silhouette partially visible, turning slightly away showing pallu, romantic and cinematic, full body" },
  { value: "royal-seating", label: "Royal Seating", prompt: "seated elegantly on an ornate throne-style chair, back straight, hands placed gracefully on armrests, regal expression, full body visible" },
  { value: "floating-fabric", label: "Floating Fabric", prompt: "standing with both arms raised to shoulder height, pallu draped over both arms and flowing outward like wings, looking straight at camera, full body" },
  { value: "mirror-reflection", label: "Mirror Reflection", prompt: "standing in front of a large ornate vintage mirror, looking at own reflection, one hand touching mirror frame, artistic and editorial" },
  { value: "stairway-glamour", label: "Stairway to Glamour", prompt: "standing on a marble staircase, one foot one step higher, hand on banister, looking back over shoulder toward camera, full body visible" },
  { value: "architectural-arch", label: "Architectural Arch", prompt: "standing centered under a grand architectural arch, symmetrical framing, arms loosely at sides, looking straight at camera, full body" },
  { value: "peacock-chair", label: "Peacock Chair Pose", prompt: "seated in a large round peacock chair, legs crossed at ankles, back elegantly upright, one arm resting on chair, looking at camera with a soft smile" },
  { value: "bridal-sitting", label: "Bridal Sitting", prompt: "" },
  { value: "temple-dancer", label: "Temple Dancer", prompt: "" },
  { value: "garden-stroll", label: "Garden Stroll", prompt: "" },
  { value: "royal-balcony", label: "Royal Balcony", prompt: "" },
  { value: "lotus-stance", label: "Lotus Stance", prompt: "" },
  { value: "drape-reveal", label: "Drape Reveal", prompt: "" },
  { value: "classical-namaste", label: "Classical Namaste", prompt: "" },
  { value: "walk-towards-camera", label: "Walk Towards Camera", prompt: "" },
  { value: "over-shoulder-glance", label: "Over Shoulder Glance", prompt: "" },
  { value: "custom", label: "CUSTOM", prompt: "" },
];

const foldStyleOptions = [
  { value: "none", label: "None (Random)", description: "Let the model choose the best premium fold layout." },
  { value: "single-open-fold", label: "Single Open Fold", description: "One elegant opening that reveals the border, pallu, and body motifs." },
  { value: "circular-fan-fold", label: "Circular Fan Fold", description: "A radial boutique-style fold with dramatic pleats and pallu reveal." },
  { value: "diagonal-luxury-fold", label: "Diagonal Luxury Fold", description: "A diagonal premium display with sweeping border emphasis." },
  { value: "pallu-feature-fold", label: "Pallu Feature Fold", description: "A folded composition where the pallu becomes the visual hero." },
  { value: "butterfly-display-fold", label: "Butterfly Display Fold", description: "Mirrored wing-like opening folds that showcase motifs and zari." },
  { value: "designer-window-fold", label: "Designer Window Fold", description: "Framed openings that reveal the saree like a boutique storefront visual." },
  { value: "luxury-flatlay-fold", label: "Luxury Flat Lay Fold", description: "Sculpted soft folds with premium spacing for e-commerce presentation." },
  { value: "bridal-hero-fold", label: "Bridal Hero Fold", description: "A dramatic ceremonial fold suited for wedding and festive collections." },
] as const;

const pleatedShowcaseOptions = [
  { value: "none", label: "None (Random)", description: "Let the model choose the best vertical pleated showcase." },
  { value: "classic-stand-display", label: "Classic Stand Display", description: "A premium showroom stand with a neat pallu and orderly lower pleats." },
  { value: "front-pleat-showcase", label: "Front Pleat Showcase", description: "A front-facing pleated display with clearly visible lower pleats." },
  { value: "side-pallu-showcase", label: "Side Pallu Showcase", description: "A vertical display with the pallu falling prominently from one side." },
  { value: "boutique-hanger-display", label: "Boutique Hanger Display", description: "An upscale hanger or display bar styled like a luxury textile store." },
  { value: "royal-display-stand", label: "Royal Display Stand", description: "A regal vertical stand presentation with ceremonial pallu emphasis." },
  { value: "bridal-display-stand", label: "Bridal Display Stand", description: "A festive bridal boutique stand with graceful lower pleats." },
  { value: "gallery-wall-display", label: "Gallery Wall Display", description: "A refined wall display with a clean, premium boutique finish." },
] as const;

async function extractDominantColors(dataURL: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve("unknown"); return; }
      ctx.drawImage(img, 0, 0, 100, 100);

      // Sample only the CENTER 60% of the image to avoid white backgrounds
      const startX = 20, startY = 20, endX = 80, endY = 80;
      const data = ctx.getImageData(startX, startY, endX - startX, endY - startY).data;

      const colorMap: Record<string, number> = {};
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Skip near-white and near-gray pixels (background)
        const brightness = (r + g + b) / 3;
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        if (brightness > 210 || saturation < 30) continue;

        // Quantize to 16-step buckets for better grouping
        const rq = Math.round(r / 16) * 16;
        const gq = Math.round(g / 16) * 16;
        const bq = Math.round(b / 16) * 16;
        const key = `${rq},${gq},${bq}`;
        colorMap[key] = (colorMap[key] || 0) + 1;
      }

      const sorted = Object.entries(colorMap).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) { resolve(""); return; }

      const top = sorted.slice(0, 2).map(([k]) => {
        const [r, g, b] = k.split(",").map(Number);
        if (r > 180 && g < 60 && b > 80 && b < 160) return "deep magenta/rani pink";
        if (r > 160 && g < 50 && b < 50) return "deep red/maroon";
        if (r > 180 && g < 80 && b < 80) return "bright red/crimson";
        if (r > 150 && g < 60 && b > 150) return "purple/violet";
        if (r < 80 && g < 80 && b > 150) return "deep blue/navy";
        if (r < 60 && g > 100 && b < 80) return "green";
        if (r > 150 && g > 120 && b < 60) return "golden/mustard";
        if (r > 180 && g > 140 && b < 80) return "antique gold/amber";
        if (r > 200 && g > 160 && b < 100) return "golden yellow";
        if (r < 80 && g > 120 && b > 150) return "teal/peacock blue";
        if (r > 180 && g > 80 && b < 60) return "orange/saffron";
        if (r > 100 && g < 60 && b > 60 && r - b < 60) return "dark pink/magenta";
        if (r > 180 && g < 100 && b > 120) return "hot pink/magenta";
        if (Math.max(r, g, b) - Math.min(r, g, b) < 40) return "neutral/grey";
        return `rgb(${r},${g},${b})`;
      });

      resolve(top.join(" with "));
    };
    img.onerror = () => resolve("");
    img.src = dataURL;
  });
}

function buildSocialCaption(
  mode: string,
  materialName: string,
  dominantColor: string,
): string {
  const colorText = dominantColor || "rich handcrafted tones";
  const material = materialName.trim() || "silk blend";

  const designByMode: Record<string, string> = {
    drape: "graceful drape with statement pallu flow and finely balanced border highlights",
    folded: "boutique folded display with neat layered arrangement and standout border detailing",
    fleeted: "structured pleated presentation with pallu-forward showcase and elegant symmetry",
  };
  const textureByMaterial =
    /cotton/i.test(material) ? "soft breathable texture with a matte-natural hand feel" :
    /linen/i.test(material) ? "airy textured weave with a crisp artisanal hand feel" :
    /organza/i.test(material) ? "light sheer texture with a floaty luminous hand feel" :
    /chiffon/i.test(material) ? "fluid featherlight texture with an effortless drape hand feel" :
    /georgette/i.test(material) ? "grainy-flow texture with a graceful fall and soft hand feel" :
    /banarasi|kanjeevaram|kanjivaram|silk/i.test(material) ? "luxurious woven texture with a rich smooth hand feel" :
    "refined woven texture with a premium hand feel";

  const stylingCue = mode === "folded"
    ? "Styled in a premium folded presentation"
    : mode === "fleeted"
      ? "Styled in a premium pleated showcase"
      : "Styled for premium visual storytelling";
  const designText = designByMode[mode] || designByMode.drape;

  return `AI social caption: This saree features ${colorText} tones, a ${designText}, and ${textureByMaterial}. Crafted in ${material}, it offers an elevated material feel made for standout social media posts. ${stylingCue}.`;
}

async function extractEdgeDominantColors(dataURL: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 80;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const edge = Math.floor(size * 0.15);
        const colorMap: Record<string, number> = {};

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (x < edge || x >= size - edge || y < edge || y >= size - edge) {
              const idx = (y * size + x) * 4;
              const r = Math.round(data[idx] / 32) * 32;
              const g = Math.round(data[idx + 1] / 32) * 32;
              const b = Math.round(data[idx + 2] / 32) * 32;
              const key = `${r},${g},${b}`;
              colorMap[key] = (colorMap[key] || 0) + 1;
            }
          }
        }

        const sorted = Object.entries(colorMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([key]) => {
            const [r, g, b] = key.split(",").map(Number);
            return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
          });

        resolve(sorted);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = dataURL;
  });
}


const Generator = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "drape";

  const [zones, setZones] = useState<UploadZone[]>([]);
  const [style, setStyle] = useState<"full" | "half" | "mannequin">("full");
  const [viewAngle, setViewAngle] = useState<"front" | "side">("front");
  const [backdrop, setBackdrop] = useState("studio");
  const [addJewellery, setAddJewellery] = useState(false);
  const [logoId, setLogoId] = useState<string>("");
  const [logos, setLogos] = useState<Logo[]>([]);
  const [customBackdrop, setCustomBackdrop] = useState("");
  const [pose, setPose] = useState("elegance-personified");
  const [customPose, setCustomPose] = useState("");
  const [foldStyle, setFoldStyle] = useState<(typeof foldStyleOptions)[number]["value"]>("none");
  const [pleatedShowcaseStyle, setPleatedShowcaseStyle] = useState<(typeof pleatedShowcaseOptions)[number]["value"]>("none");
  const [modelLook, setModelLook] = useState("south-indian");
  const [materialName, setMaterialName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [socialCaption, setSocialCaption] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lowBalanceDialog, setLowBalanceDialog] = useState<{ open: boolean; balance: number; threshold: number }>({ open: false, balance: 0, threshold: 50 });
  const { user } = useAuth();
  const { organization, walletBalance, refreshWallet } = useOrganization();
  const [quality, setQuality] = useState<"standard" | "hd">("standard");
  const [resolution, setResolution] = useState<string>("1024");
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Set upload zones based on mode
  useEffect(() => {
    switch (mode) {
      case "drape":
        setZones([
          { label: "Saree Body", key: "body", file: null, preview: null },
          { label: "Border (BR)", key: "border", file: null, preview: null },
          { label: "Pallu", key: "pallu", file: null, preview: null },
          { label: "Blouse (Optional)", key: "blouse", file: null, preview: null, optional: true },
        ]);
        break;
      case "folded":
        setZones([
          { label: "Folded Saree", key: "saree", file: null, preview: null },
        ]);
        break;
      case "fleeted":
        setZones([
          { label: "Saree Body", key: "body", file: null, preview: null },
          { label: "Border (BR)", key: "border", file: null, preview: null },
          { label: "Pallu", key: "pallu", file: null, preview: null },
        ]);
        break;
    }
  }, [mode]);

  // Fetch logos
  useEffect(() => {
    const fetchLogos = async () => {
      const { data } = await supabase.from("logos").select("*").order("created_at", { ascending: false });
      if (data) setLogos(data as Logo[]);
    };
    fetchLogos();
  }, []);

  const handleFileChange = (index: number, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setZones((prev) =>
        prev.map((z, i) =>
          i === index ? { ...z, file, preview: e.target?.result as string } : z
        )
      );
    };
    reader.readAsDataURL(file);
  };

  const allUploaded = zones.length > 0 && zones.filter((z) => !z.optional).every((z) => z.file);

  const handleGenerate = async () => {
    if (!allUploaded || !user) return;

    setIsGenerating(true);
    setResultImage(null);
    setSocialCaption("");

    try {
      // Build images object for edge function
      const images: Record<string, string> = {};
      for (const zone of zones) {
        if (!zone.file) continue;
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataURL = e.target?.result as string;
            resolve(dataURL.split(",")[1]);
          };
          reader.readAsDataURL(zone.file!);
        });
        images[zone.key] = base64;
      }

      const customPrompts: Record<string, string> = {};
      if (customBackdrop) customPrompts.backdrop = customBackdrop;
      if (pose === "custom" && customPose) customPrompts.pose = customPose;

      const primaryPreview = zones.find((z) => z.key === "body" || z.key === "saree")?.preview ?? null;
      const borderPreview = zones.find((z) => z.key === "border")?.preview ?? null;
      const dominantColor = primaryPreview ? await extractDominantColors(primaryPreview) : "";
      const dominantColors = dominantColor ? dominantColor.split(" with ").filter(Boolean) : [];
      const borderDominantColors = borderPreview
        ? await extractEdgeDominantColors(borderPreview)
        : primaryPreview
          ? await extractEdgeDominantColors(primaryPreview)
          : [];

      const { data, error } = await supabase.functions.invoke("generate-saree", {
        body: {
          images,
          mode,
          style,
          viewAngle,
          backdrop,
          addJewellery,
          pose,
          customPrompts,
          logoId,
          foldStyle,
          pleatedShowcaseStyle,
          modelLook,
          dominantColors,
          borderDominantColors,
          materialName,
          organization_id: organization?.id ?? null,
          quality,
          resolution,
        },
      });

      if (error) throw error;
      if (data?.code === "LOW_BALANCE" || data?.code === "INSUFFICIENT_BALANCE") {
        setLowBalanceDialog({ open: true, balance: data.balance ?? 0, threshold: data.threshold ?? 50 });
        refreshWallet();
        return;
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.imageBase64) throw new Error("No image returned");

      // data.imageBase64 is already a data URL — use directly as canvas source
      const tempUrl = data.imageBase64;

      // Draw to canvas for logo watermark
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = tempUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get 2D canvas context");
      ctx.drawImage(img, 0, 0);

      if (logoId && logoId !== "none") {
        const selectedLogo = logos.find((l) => l.id === logoId);
        if (selectedLogo) {
          const { data: publicUrlData } = supabase.storage.from("logos").getPublicUrl(selectedLogo.file_path);
          const logoUrl = publicUrlData.publicUrl;
          try {
            const logoImgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.crossOrigin = "anonymous";
              el.onload = () => resolve(el);
              el.onerror = reject;
              el.src = logoUrl;
            });
            const logoMaxW = canvas.width * 0.15;
            if (logoImgEl.width <= 0 || logoImgEl.height <= 0) throw new Error("Invalid logo dimensions");
            const logoScale = logoMaxW / logoImgEl.width;
            const logoW = logoImgEl.width * logoScale;
            const logoH = logoImgEl.height * logoScale;
            const margin = 16;
            const textHeight = 18;
            const logoX = canvas.width - logoW - margin;
            const logoY = canvas.height - logoH - textHeight - margin;
            ctx.globalAlpha = 0.8;
            ctx.drawImage(logoImgEl, logoX, logoY, logoW, logoH);
            ctx.globalAlpha = 1;
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = "bold 14px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("BANGALORE", logoX + logoW / 2, logoY + logoH + textHeight - 2);
          } catch {
            // Logo load failed — skip watermark silently
          }
        }
      }

      if (mode === "drape") {
        const notice = "This model is AI generated.";
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, canvas.height - 32, canvas.width, 32);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(notice, canvas.width / 2, canvas.height - 11);
      }

      const resultBlobURL = await new Promise<string>((resolve, reject) => {
        canvas.toBlob(
          (blobResult) => {
            if (!blobResult) return reject(new Error("Canvas toBlob failed"));
            resolve(URL.createObjectURL(blobResult));
          },
          "image/jpeg",
          0.92
        );
      });
      setResultImage(resultBlobURL);
      setSocialCaption(data?.socialCaption || buildSocialCaption(mode, materialName, dominantColor));
      toast({ title: "Image generated successfully!" });
      // Refresh wallet balance after successful charge
      refreshWallet();
    } catch (err: any) {
      console.error("Generation error full:", err);
      const msg = err?.message || err?.toString() || JSON.stringify(err) || "Unknown error";
      toast({
        title: "Generation failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement("a");
    a.href = resultImage;
    a.download = `vastraai-${mode}-${Date.now()}.jpg`;
    a.click();
  };

  const handleCopyCaption = async () => {
    if (!socialCaption) return;
    try {
      await navigator.clipboard.writeText(socialCaption);
      toast({ title: "Caption copied" });
    } catch {
      toast({ title: "Could not copy caption", variant: "destructive" });
    }
  };

  const modeTitle: Record<string, string> = {
    drape: "Saree AI Drape",
    folded: "Folded Saree AI Image",
    fleeted: "Pleated Saree AI Image",
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-serif font-bold text-foreground">{modeTitle[mode] || "Generator"}</h1>
          <p className="text-muted-foreground mt-1">Upload saree images and customize your generation</p>
          {/* Step indicator */}
          {(() => {
            const currentStep = !allUploaded ? 1 : (isGenerating || !!resultImage) ? 3 : 2;
            const steps = [{ num: 1, label: "FABRIC VIZ" }, { num: 2, label: "POSE STUDIO" }, { num: 3, label: "GENERATE" }];
            return (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {steps.map((step, idx) => (
                  <div key={step.num} className="flex items-center gap-1">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${currentStep === step.num ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {step.num}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${currentStep === step.num ? "text-primary" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                    {idx < 2 && <span className="text-muted-foreground mx-1 text-xs">→</span>}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Step 1: Logo Selector */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-sans">Step 1 — Select Logo Watermark</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={logoId} onValueChange={setLogoId}>
            <SelectTrigger>
              <SelectValue placeholder="No logo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No logo</SelectItem>
              {logos.map((logo) => (
                <SelectItem key={logo.id} value={logo.id}>{logo.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* AI Model is hardcoded to Gemini 2.5 Flash Image */}
      {/* Step 2: Upload Zones */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Step 2 — Upload Saree Images</h2>
        {(() => {
          const reqCount = zones.filter((z) => !z.optional).length;
          const colClass = reqCount === 1 ? "grid-cols-1 max-w-sm" : reqCount === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3";
          return (
            <div className={`grid gap-4 ${colClass}`}>
              {zones.map((zone, i) => (
                <Card key={zone.key} className={`border-border/50 ${zone.optional ? "opacity-80" : ""}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-sans">{zone.label}</CardTitle>
                    {zone.optional && <p className="text-xs text-muted-foreground -mt-1">(Optional)</p>}
                  </CardHeader>
                  <CardContent>
                    <input
                      ref={(el) => (fileInputRefs.current[i] = el)}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange(i, e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => fileInputRefs.current[i]?.click()}
                      className={`w-full aspect-square rounded-lg border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden bg-muted/30 ${zone.optional && !zone.preview ? "border-border/40 hover:border-primary/30" : "border-border hover:border-primary/50"}`}
                    >
                      {zone.preview ? (
                        <img src={zone.preview} alt={zone.label} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <div className="text-center text-muted-foreground">
                          <Upload className="h-8 w-8 mx-auto mb-2" />
                          <span className="text-sm">Click to upload</span>
                        </div>
                      )}
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Fold / Pleated Style */}
      {mode === "folded" && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-sans">Fold Style</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {foldStyleOptions.map((opt) => (
              <div
                key={opt.value}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${foldStyle === opt.value ? "bg-primary/10 border border-primary/30" : "bg-muted/30 hover:bg-muted/50"}`}
                onClick={() => setFoldStyle(opt.value)}
              >
                <span className="font-medium text-sm">{opt.label}</span>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {mode === "fleeted" && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-sans">Pleated Showcase Style</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pleatedShowcaseOptions.map((opt) => (
              <div
                key={opt.value}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${pleatedShowcaseStyle === opt.value ? "bg-primary/10 border border-primary/30" : "bg-muted/30 hover:bg-muted/50"}`}
                onClick={() => setPleatedShowcaseStyle(opt.value)}
              >
                <span className="font-medium text-sm">{opt.label}</span>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 3+: Style & Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mode === "drape" && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-sans">Step 3 — Pose Style</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`p-3 rounded-lg cursor-pointer transition-colors ${style === "full" ? "bg-primary/10 border border-primary/30" : "bg-muted/30 hover:bg-muted/50"}`}
                onClick={() => setStyle("full")}
              >
                <span className="font-medium text-sm">Full Face Model</span>
                <p className="text-xs text-muted-foreground">Strictly full face of the model must be visible.</p>
              </div>
              <div
                className={`p-3 rounded-lg cursor-pointer transition-colors ${style === "half" ? "bg-primary/10 border border-primary/30" : "bg-muted/30 hover:bg-muted/50"}`}
                onClick={() => setStyle("half")}
              >
                <span className="font-medium text-sm">Half Face Model</span>
                <p className="text-xs text-muted-foreground">Strictly half face profile of the model must be visible.</p>
              </div>
              <div
                className={`p-3 rounded-lg cursor-pointer transition-colors ${style === "mannequin" ? "bg-primary/10 border border-primary/30" : "bg-muted/30 hover:bg-muted/50"}`}
                onClick={() => setStyle("mannequin")}
              >
                <span className="font-medium text-sm">Mannequin Doll</span>
                <p className="text-xs text-muted-foreground">Use a mannequin doll only, no real human model.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "drape" && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-sans">Step 3B — View Angle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`p-3 rounded-lg cursor-pointer transition-colors ${viewAngle === "front" ? "bg-primary/10 border border-primary/30" : "bg-muted/30 hover:bg-muted/50"}`}
                onClick={() => setViewAngle("front")}
              >
                <span className="font-medium text-sm">Front Pose</span>
                <p className="text-xs text-muted-foreground">Model/mannequin faces the camera from the front.</p>
              </div>
              <div
                className={`p-3 rounded-lg cursor-pointer transition-colors ${viewAngle === "side" ? "bg-primary/10 border border-primary/30" : "bg-muted/30 hover:bg-muted/50"}`}
                onClick={() => setViewAngle("side")}
              >
                <span className="font-medium text-sm">Side Pose</span>
                <p className="text-xs text-muted-foreground">Model/mannequin is shown in strict side profile.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "drape" && (
          <Card className="border-border/50 md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-sans">Pose Matrix</CardTitle>
              <p className="text-xs text-muted-foreground">Select a cinematic pose</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {poseMatrix.map((opt) => (
                  <div
                    key={opt.value}
                    className={`h-20 rounded-lg border cursor-pointer transition-colors flex items-center justify-center p-2 text-center ${pose === opt.value ? "bg-primary/20 border-primary" : "bg-muted/20 border-border hover:bg-muted/40"}`}
                    onClick={() => setPose(opt.value)}
                  >
                    <span className={`text-[11px] font-semibold uppercase tracking-wide leading-tight ${opt.value === "custom" ? "text-primary" : ""}`}>
                      {opt.label}
                    </span>
                  </div>
                ))}
              </div>
              {pose === "custom" && (
                <Textarea
                  value={customPose}
                  onChange={(e) => setCustomPose(e.target.value)}
                  placeholder="Describe the pose... e.g., 'Standing gracefully with one hand on hip, looking over shoulder'"
                  className="resize-none mt-3"
                  rows={2}
                />
              )}
            </CardContent>
          </Card>
        )}

        {mode === "drape" && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-sans">Model Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { value: "south-indian", label: "South Indian", description: "Traditional South Indian features, wheatish complexion" },
                { value: "north-indian", label: "North Indian", description: "North Indian features, fair complexion" },
                { value: "dusky", label: "Dusky & Elegant", description: "Deep dusky complexion, strong features" },
                { value: "young-bride", label: "Young Bride", description: "Bridal look, mid-20s, full makeup" },
                { value: "mature-elegant", label: "Mature & Elegant", description: "Graceful woman in her 40s, sophisticated" },
                { value: "tam-brahmin", label: "Traditional Tam Brahmin", description: "Traditional Tamil features, bindi, minimal jewellery, devotional look" },
                { value: "rajasthani", label: "Rajasthani", description: "Rajasthani features, traditional look, vivid ethnic style" },
                { value: "bengali", label: "Bengali", description: "Bengali features, fair complexion, traditional bindi and conch-shell bangles" },
                { value: "teen-college", label: "Young & Modern", description: "Young woman 18-22 years, fresh casual look, modern styling" },
                { value: "professional", label: "Modern Professional", description: "Working woman look, confident, neat hair, formal bearing" },
              ].map((opt) => (
                <div
                  key={opt.value}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${modelLook === opt.value ? "bg-primary/10 border border-primary/30" : "bg-muted/30 hover:bg-muted/50"}`}
                  onClick={() => setModelLook(opt.value)}
                >
                  <span className="font-medium text-sm">{opt.label}</span>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {mode === "drape" && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-sans">Step 4 — Backdrop Style</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={backdrop} onValueChange={setBackdrop}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {backdropOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {mode === "drape" && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-sans">Step 5 — Add Jewellery</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Switch checked={addJewellery} onCheckedChange={setAddJewellery} />
                <Label className="text-sm text-muted-foreground">
                  {addJewellery ? "Traditional jewellery will be added" : "No jewellery"}
                </Label>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {mode === "drape" && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-sans">Custom Backdrop (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label className="text-sm mb-1.5 block">Backdrop Description</Label>
              <Textarea
                value={customBackdrop}
                onChange={(e) => setCustomBackdrop(e.target.value)}
                placeholder="Describe the backdrop you want... e.g., 'Elegant palace courtyard with marble pillars and warm sunset lighting'"
                className="resize-none"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate Button */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-sans">Social Media Caption Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="material-name">Material Name (for AI caption)</Label>
          <Input
            id="material-name"
            value={materialName}
            onChange={(e) => setMaterialName(e.target.value)}
            placeholder="e.g., Kanjivaram Silk, Organza, Cotton Silk"
          />
          <p className="text-xs text-muted-foreground">
            After generation, an AI caption will be created with color, design, texture, and material feel.
          </p>
        </CardContent>
      </Card>

      {/* Quality / Model picker */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-sans">Image Quality</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["standard", "hd"] as const).map((tier) => {
            return (
              <div
                key={tier}
                className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                  quality === tier
                    ? "bg-primary/10 border-primary/40"
                    : "bg-muted/30 border-border/50 hover:bg-muted/50"
                }`}
                onClick={() => { setQuality(tier); setResolution("1024"); }}
              >
                <div className="flex items-center gap-2">
                  {tier === "hd" ? (
                    <Star className="h-4 w-4 text-accent" />
                  ) : (
                    <Zap className="h-4 w-4 text-primary" />
                  )}
                  <span className="font-medium text-sm">{QUALITY_LABELS[tier]}</span>
                  {tier === "hd" && (
                    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-semibold">4K</span>
                  )}
                  {tier === "standard" && (
                    <span className="text-xs text-muted-foreground">— Fast generation</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Resolution picker */}
          <div className="pt-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">Output Resolution</p>
            <div className="grid grid-cols-2 gap-2">
              {RESOLUTION_OPTIONS[quality].map((opt) => (
                <div
                  key={opt.value}
                  className={`p-2 rounded-lg cursor-pointer transition-colors border text-center ${
                    resolution === opt.value
                      ? "bg-primary/10 border-primary/40"
                      : "bg-muted/30 border-border/50 hover:bg-muted/50"
                  }`}
                  onClick={() => setResolution(opt.value)}
                >
                  <p className="text-xs font-semibold">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Wallet balance indicator (no cost exposed) */}
          {walletBalance !== null && (
            <div className={`flex items-center gap-1.5 text-sm rounded-lg px-3 py-2 ${
              walletBalance <= 50
                ? "bg-destructive/10 text-destructive"
                : "bg-accent/10 text-accent"
            }`}>
              {walletBalance <= 50 ? <AlertTriangle className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
              <span>Wallet balance: ₹{walletBalance.toFixed(2)}</span>
              {walletBalance <= 50 && <span className="font-semibold ml-1">— Low balance</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Button */}
      {walletBalance !== null && walletBalance <= 50 ? (
        <Button
          size="lg"
          className="w-full text-lg py-6"
          variant="destructive"
          onClick={() => setLowBalanceDialog({ open: true, balance: walletBalance, threshold: 50 })}
        >
          <AlertTriangle className="h-5 w-5 mr-2" />
          Low balance — Recharge to generate
        </Button>
      ) : (
        <Button
          size="lg"
          className="w-full text-lg py-6"
          disabled={!allUploaded || isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              {"🎨 Generating your saree image..."}
            </>
          ) : (
            `Generate ${mode === "drape" ? "Drape Image" : mode === "folded" ? "Folded Display" : "Pleated Display"}`
          )}
        </Button>
      )}

      {/* Loading Shimmer */}
      {isGenerating && (
        <div className="w-full aspect-[3/4] max-w-lg mx-auto rounded-xl shimmer" />
      )}

      {/* Result */}
      {resultImage && !isGenerating && (
        <Card className="border-border/50 max-w-lg mx-auto">
          <CardContent className="p-4 space-y-4">
            <img
              src={resultImage}
              alt="Generated saree"
              className="w-full rounded-lg cursor-zoom-in"
              onClick={() => setLightboxOpen(true)}
            />
            <p className="text-xs text-muted-foreground text-center">Tap image to zoom</p>
            {mode === "drape" && <p className="text-[11px] text-muted-foreground text-center">Disclaimer: This model is AI generated.</p>}
            {socialCaption && (
              <div className="space-y-2">
                <Label>AI Social Media Caption</Label>
                <Textarea value={socialCaption} readOnly className="min-h-28" />
                <Button type="button" variant="outline" className="w-full gap-2" onClick={handleCopyCaption}>
                  <Copy className="h-4 w-4" /> Copy Caption
                </Button>
              </div>
            )}
            <Button onClick={handleDownload} className="w-full gap-2">
              <Download className="h-4 w-4" /> Download Image
            </Button>
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
              Generated images are not saved — download before leaving this page.
            </p>
          </CardContent>
        </Card>
      )}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute -top-10 right-0 text-white text-3xl leading-none"
              onClick={() => setLightboxOpen(false)}
            >
              ×
            </button>
            <img
              src={resultImage!}
              alt="Generated saree fullscreen"
              className="max-w-[95vw] max-h-[90vh] rounded-lg object-contain"
            />
          </div>
        </div>
      )}

      {/* ── Low Balance / Freeze Dialog ── */}
      <Dialog open={lowBalanceDialog.open} onOpenChange={(open) => setLowBalanceDialog((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <div className="flex justify-center mb-2">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <DialogTitle className="text-xl font-serif">Wallet Balance Low</DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block text-3xl font-bold text-destructive">
                ₹{lowBalanceDialog.balance.toFixed(2)}
              </span>
              <span className="block text-sm text-muted-foreground">
                Image generation is paused when your balance drops to ₹{lowBalanceDialog.threshold} or below.
                Please recharge your wallet to continue.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full gap-2"
              onClick={() => { setLowBalanceDialog((s) => ({ ...s, open: false })); navigate("/wallet"); }}
            >
              <Wallet className="h-4 w-4" />
              Recharge Wallet
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setLowBalanceDialog((s) => ({ ...s, open: false }))}>
              Maybe later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Generator;
