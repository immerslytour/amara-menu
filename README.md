# Amara · Cocina Mexicana Moderna

Sitio de menú para **Amara**, 3874 N Blackstone Ave, Fresno, CA 93726.
Estático, sin build, sin dependencias. Se publica en GitHub Pages tal cual.

Producido por **Guidepost Media**.

---

## Publicar en GitHub Pages

```bash
# 1. Crear el repo en GitHub (nombre sugerido: amara-menu)
# 2. Desde esta carpeta:
git remote add origin https://github.com/TU-USUARIO/amara-menu.git
git branch -M main
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.

El sitio queda en `https://TU-USUARIO.github.io/amara-menu/`.

### Dominio propio

Si Amara quiere `menu.amaramexicancuisine.com`:

1. Crea un archivo `CNAME` en la raíz con esa línea.
2. En el DNS del dominio, apunta un registro `CNAME` a `TU-USUARIO.github.io`.
3. En **Settings → Pages → Custom domain**, escribe el dominio y activa *Enforce HTTPS*.

---

## Imágenes

Las fotos son **generadas con IA** (Higgsfield · Nano Banana Pro) y funcionan como
*placeholders de alta calidad*. Antes de que el sitio sea público conviene
reemplazarlas por fotografía real de los platillos de Amara.

Ahorita el sitio carga desde el CDN de Higgsfield. Para volverlo autónomo:

```bash
chmod +x fetch-images.sh
./fetch-images.sh
git add assets/img && git commit -m "Add imagery" && git push
```

Para cambiar una foto: reemplaza el archivo en `assets/img/` con el mismo nombre.
No hay que tocar código.

| Archivo | Dónde aparece |
|---|---|
| `hero.png` | Portada |
| `brunch.png` | Sección Brunch |
| `molcajete.png` | Especialidades de la Casa |
| `pulpo.png` | Grupo Del Mar |
| `tacos.png` | Sección Cena |

---

## Editar el menú

Todo el contenido vive en **`assets/data/menu.json`**. No hay que tocar HTML.

```json
{
  "name":  { "es": "Pulpo Zarandeado", "en": "Pulpo Zarandeado" },
  "price": 33,
  "star":  true,
  "veg":   false,
  "desc":  { "es": "…", "en": "…" },
  "addons": [{ "es": "Agrega huevo", "en": "Add egg", "price": 3 }]
}
```

- `price` es un número, sin `$`.
- `star: true` pinta la etiqueta dorada **★ Más pedido**.
- `veg: true` pinta la etiqueta **Vegetariano**.
- `addons` y `desc` son opcionales.

Cambia el precio, haz push, y en ~30 segundos está en vivo.

---

## Estructura

```
index.html
assets/
  css/style.css      — todo el diseño
  js/app.js          — render, idioma, "Arma tu mesa"
  data/menu.json     — TODO el contenido del menú
  img/               — imágenes (correr fetch-images.sh)
fetch-images.sh
```

---

## Qué trae

- **Menú bilingüe ES/EN** — se cambia sin recargar y recuerda la preferencia.
- **Arma tu mesa** — el comensal toca los platillos, ve el total corriendo, lo
  divide entre N personas y comparte la lista por WhatsApp o la copia. Los
  precios de Amara van de $13 a $46, así que ver el total antes de pedir baja
  la fricción — y es la parte del sitio que genera intención de compra.
- Navegación pegajosa con scroll-spy por sección.
- Datos estructurados `schema.org/Restaurant` para Google.
- Responsive, accesible por teclado, respeta `prefers-reduced-motion`,
  y tiene hoja de estilos de impresión (imprime el menú limpio, sin fotos).

---

## Pendiente para revisar con el cliente

Los tres menús impresos tienen **precios distintos para el mismo platillo**.
El sitio respeta lo impreso en cada sección, pero hay que confirmar cuál es el
correcto:

| Platillo | Brunch | Cena |
|---|---|---|
| Amara Salad | $17 | $20 |
| Enchiladas de Doña Aida | $27 | $23 |
| Mole de Doña Ester | $23 | $27 |
| Chicken Fajitas | $25 | $27 |

También en el menú impreso: *"RibeyeChicharrón"*, *"chickenenchiladas"* y
*"Amaras"* / *"Amara's"* aparecen sin espacio o inconsistentes. Ya quedaron
corregidos aquí.
