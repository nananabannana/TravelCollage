// Vercel serverless function: reads a photo of a travel-journal page with Claude
// and returns the elements on it (pasted paper, handwriting, tape, doodles, stamps).
// Set ANTHROPIC_API_KEY in the Vercel project's Environment Variables.
// Optional: ANTHROPIC_MODEL (default claude-sonnet-5-5), ALLOWED_ORIGIN (e.g. https://travel-collage-kappa.vercel.app).

const PROMPT = "This image is a photo of one page of a handmade travel journal (a scrapbook). I will rebuild the page digitally, element by element, so I need every separate element that was pasted, written or drawn on it.\n\nAnswer with JSON only, no prose, in exactly this shape:\n{\"page\":[x0,y0,x1,y1],\"items\":[ ... ]}\n\n\"page\" is the journal page itself inside the photo (leave out the desk, laptop, hands or anything around it).\n\"items\" lists the elements from the bottom-most layer to the top-most layer (things pasted later, on top, come later). Each item is one of:\n{\"kind\":\"cutout\",\"box\":[x0,y0,x1,y1],\"edge\":\"torn\" or \"cut\",\"label\":\"short description\"} - any pasted paper or picture: ticket, boarding pass, map, postcard, photo, flyer, receipt, label, wrapping paper. A sketch drawn directly on the page as a picture is also a cutout (edge \"cut\").\n{\"kind\":\"text\",\"box\":[x0,y0,x1,y1],\"text\":\"exact transcription, \\n between lines\",\"color\":\"red\" or \"blue\" or \"navy\" or \"black\" or \"duo\",\"style\":\"hand\" or \"marker\"} - handwritten words such as titles, dates, notes. \"duo\" means letters drawn in two colours. \"marker\" means thick bold letters.\n{\"kind\":\"tape\",\"box\":[x0,y0,x1,y1],\"angle\":degrees,\"pattern\":\"dots\" or \"stripe\" or \"kraft\" or \"mint\" or \"check\" or \"clear\"} - washi or masking tape. angle is the direction of the tape's length, 0 = horizontal, positive = clockwise.\n{\"kind\":\"doodle\",\"box\":[x0,y0,x1,y1],\"color\":\"duo\" or \"red\" or \"blue\" or \"navy\"} - decorative swirls, wavy lines or borders drawn with a pen.\n{\"kind\":\"stamp\",\"box\":[x0,y0,x1,y1],\"text\":\"text in the stamp\"} - rubber-stamp imprints.\n\nCoordinates are integers from 0 to 1000: x relative to the full photo width, y relative to the full photo height. Each box must tightly enclose that element's outline. When pieces overlap, give each piece its full outline, including the part hidden under another piece. Do not merge separate pieces. Ignore the page's own grid or ruled lines.\nIf the photo is not a journal or scrapbook page (for example an ordinary travel photo), answer {\"page\":null,\"items\":[]}.";

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'not_configured' });
  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed && req.headers.origin && req.headers.origin !== allowed) return res.status(403).json({ error: 'forbidden_origin' });

  const image = req.body && req.body.image;
  if (typeof image !== 'string' || !image.length) return res.status(400).json({ error: 'image_required' });
  if (image.length > 6 * 1024 * 1024) return res.status(413).json({ error: 'image_too_large' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: PROMPT }
        ] }]
      })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j && j.error && j.error.message) || 'upstream_error' });
    const text = (j.content || []).map(c => c.text || '').join('');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'upstream_unreachable' });
  }
};
