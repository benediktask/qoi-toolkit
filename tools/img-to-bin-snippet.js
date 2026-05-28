// copy and paste this into browser console window on an empty page
(async () => {
    const showPicker = () => new Promise(res => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/jpeg';
        input.onchange = () => res(input.files[0]);
        input.click();
    });

    console.log("Please select your image.jpg...");
    const file = await showPicker();
    const img = await createImageBitmap(file);
    const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const blob = new Blob([data], { type: 'application/octet-stream' });

    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'pixel_data.bin' });
    a.click();
    console.log(`Success! Extracted ${data.length} raw RGBA bytes.`);
})();