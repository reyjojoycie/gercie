// lib/validations/auth.ts
import { z } from 'zod'
import { phoneSchema, emailSchema } from './common'

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
})

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'Mot de passe trop court (minimum 6 caractères)'),
  confirmPassword: z.string(),
  nom: z.string().min(1, 'Le nom est requis'),
  prenom: z.string().min(1, 'Le prénom est requis'),
  telephone: phoneSchema,
  question_secrete: z.string().min(3, 'Veuillez choisir une question de sécurité'),
  reponse_secrete: z.string().min(2, 'La réponse doit contenir au moins 2 caractères'),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'Vous devez accepter les conditions générales',
  }),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
})

export const resetPasswordCheckSchema = z.object({
  email: emailSchema,
})

export const resetPasswordVerifySchema = z.object({
  email: emailSchema,
  answer: z.string().min(1, 'La réponse est requise'),
})

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().min(6, 'Le nouveau mot de passe doit contenir au moins 6 caractères'),
})