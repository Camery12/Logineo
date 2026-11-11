#!/usr/bin/env bash
# Baut die statische Version für die Claude-Seite (ohne Node-Server) nach ./artifact
set -e
cd "$(dirname "$0")"
rm -rf artifact && mkdir -p artifact/vendor/three artifact/vendor/three-jsm/postprocessing artifact/vendor/three-jsm/shaders artifact/vendor/three-jsm/environments
cp -r public/css public/js artifact/
sed '/socket.io\/socket.io.js/d' public/index.html > artifact/index.html
cp node_modules/chess.js/dist/esm/chess.js artifact/vendor/chess.js
cp node_modules/three/build/three.module.min.js artifact/vendor/three/three.module.js
J=node_modules/three/examples/jsm
for f in EffectComposer RenderPass UnrealBloomPass OutputPass Pass ShaderPass MaskPass; do cp $J/postprocessing/$f.js artifact/vendor/three-jsm/postprocessing/; done
for f in CopyShader LuminosityHighPassShader OutputShader; do cp $J/shaders/$f.js artifact/vendor/three-jsm/shaders/; done
cp $J/environments/RoomEnvironment.js artifact/vendor/three-jsm/environments/
sed -i 's#^//\# sourceMappingURL=.*##' artifact/vendor/chess.js
echo "fertig: $(find artifact -type f | wc -l) Dateien, $(du -sh artifact | cut -f1)"
