// components/profile/cropImage.ts
import { Area } from 'react-easy-crop'

export default async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<File> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('Canvas vide'))
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      resolve(file)
    }, 'image/jpeg')
  })
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}