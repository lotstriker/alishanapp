vendor/  -  libraries kept INSIDE the app so it needs no internet at all
================================================================================
The app looks here first and only goes to the internet if a file is missing.
Download these files ONCE (while you are online) and put them in this folder with exactly these names:

  xlsx.full.min.js   (Excel / CSV export)
      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js

  chart.umd.js       (graphs in Reports)
      https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js

  cropper.min.js and cropper.min.css   (photo crop on the Settings page)
      https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js
      https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css

Even without these files the app works offline after it has been opened once while online:
the service worker (sw.js) keeps a copy of the libraries the first time they are downloaded.
