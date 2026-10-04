update storage.buckets
set file_size_limit=52428800,
    allowed_mime_types=array[
      'image/jpeg','image/png','image/webp','video/mp4',
      'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac',
      'audio/wav','audio/x-wav','audio/vnd.wave','audio/ogg'
    ]
where id='church-website-public-media';
