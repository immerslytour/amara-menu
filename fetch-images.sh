#!/usr/bin/env bash
# Downloads the Higgsfield-generated imagery into assets/img/ so the site
# stops depending on the CDN. Run once, then commit assets/img/.
#
#   chmod +x fetch-images.sh && ./fetch-images.sh
#
# Note: the CDN links are temporary. If a download 403s or 404s, the images
# have expired — regenerate them in Higgsfield and swap the URLs below.

set -euo pipefail

CDN="https://d8j0ntlcm91z4.cloudfront.net/user_3G3YsPEoYVEm18Lcqm4VbjYAo3M"
DEST="assets/img"

mkdir -p "$DEST"

declare -A IMAGES=(
  [hero]="hf_20260826_185747_d6a3fff4-edaa-4cf8-a818-b8aee8c2e3f2.png"
  [brunch]="hf_20260826_185825_3b5bb598-3e14-4961-9642-ab41c2c9980f.png"
  [tacos]="hf_20260826_185825_9b5e4fcd-e508-4450-a3a9-f33129d60edf.png"
  [molcajete]="hf_20260826_185825_19548647-44fb-4246-89f0-4d9e49b9c28a.png"
  [pulpo]="hf_20260826_185825_acdd9203-9e10-4363-89ae-79979eecd3f5.png"
)

for name in "${!IMAGES[@]}"; do
  echo "→ $name.png"
  curl -fsSL "$CDN/${IMAGES[$name]}" -o "$DEST/$name.png"
done

echo
echo "Done. ${#IMAGES[@]} images in $DEST/"
echo "Now: git add assets/img && git commit -m 'Add imagery' && git push"
