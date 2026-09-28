import sharp from "sharp";
import fs from "fs";
import path from "path";

async function generate() {
  const rootDir = process.cwd();
  const inputImage = path.join(rootDir, "public", "sparkbooks_whatsapp_logo.jpg");
  const publicDir = path.join(rootDir, "public");
  const appDir = path.join(rootDir, "src", "app");

  console.log("Generating favicons from:", inputImage);

  // 1. Apple Touch Icon 180x180
  await sharp(inputImage)
    .resize(180, 180, { fit: "cover" })
    .png()
    .toFile(path.join(publicDir, "apple-touch-icon.png"));

  await sharp(inputImage)
    .resize(180, 180, { fit: "cover" })
    .png()
    .toFile(path.join(publicDir, "apple-touch-icon-precomposed.png"));

  await sharp(inputImage)
    .resize(180, 180, { fit: "cover" })
    .png()
    .toFile(path.join(appDir, "apple-icon.png"));

  // 2. Android Chrome 192x192 & 512x512
  await sharp(inputImage)
    .resize(192, 192, { fit: "cover" })
    .png()
    .toFile(path.join(publicDir, "icon-192.png"));

  await sharp(inputImage)
    .resize(512, 512, { fit: "cover" })
    .png()
    .toFile(path.join(publicDir, "icon-512.png"));

  // 3. Standard favicon 32x32 & 16x16
  await sharp(inputImage)
    .resize(32, 32, { fit: "cover" })
    .png()
    .toFile(path.join(publicDir, "favicon-32x32.png"));

  await sharp(inputImage)
    .resize(32, 32, { fit: "cover" })
    .png()
    .toFile(path.join(appDir, "icon.png"));

  await sharp(inputImage)
    .resize(16, 16, { fit: "cover" })
    .png()
    .toFile(path.join(publicDir, "favicon-16x16.png"));

  // 4. Favicon.ico (written as 32x32 png or raw buffer)
  const icoBuffer = await sharp(inputImage)
    .resize(32, 32, { fit: "cover" })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);
  fs.writeFileSync(path.join(appDir, "favicon.ico"), icoBuffer);

  // 5. Create manifest.json for mobile Chrome & PWA
  const manifest = {
    name: "SparkBooks — AI WhatsApp Bookkeeping",
    short_name: "SparkBooks",
    description: "AI-powered bookkeeping on WhatsApp for sellers",
    start_url: "/",
    display: "standalone",
    background_color: "#FDFBF7",
    theme_color: "#10B981",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };

  fs.writeFileSync(
    path.join(publicDir, "site.webmanifest"),
    JSON.stringify(manifest, null, 2)
  );

  console.log("Successfully generated all mobile and desktop favicon assets!");
}

generate().catch((err) => {
  console.error("Favicon generation error:", err);
  process.exit(1);
});
