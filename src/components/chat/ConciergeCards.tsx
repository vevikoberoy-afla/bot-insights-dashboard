'use client'

import React, { useRef, useState, type ReactNode } from "react"
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Grid2X2,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  Ticket,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export function ChatCard({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`chat-card ${className}`}>{children}</div>
}

export function ProductCard({ 
  title = "Aura Pour-Over Station",
  subtitle = "Cast Brass & Borosilicate glass",
  price = "$480",
  initials = "hy",
  onDetails 
}: { 
  title?: string
  subtitle?: string
  price?: string
  initials?: string
  onDetails?: () => void 
}) {
  return (
    <ChatCard>
      <div className="product-row">
        <div className="product-monogram">{initials}</div>
        <div className="product-copy">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <strong className="product-price">{price}</strong>
      </div>
      <div className="product-bottom">
        <span className="stock-label">
          <i />
          In Atelier Showroom
        </span>
        {onDetails && (
          <Button variant="link" size="sm" onClick={onDetails}>
            View Details <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        )}
      </div>
    </ChatCard>
  )
}

export function ProductActions({ onAction }: { onAction: (label: string) => void }) {
  return (
    <div className="product-actions">
      {[
        { label: "Check Specifications", icon: FileText },
        { label: "Reserve in Zurich", icon: MapPin },
        { label: "Copper Collection", icon: Grid2X2 },
        { label: "Warranty & Care", icon: ShieldCheck },
      ].map(({ label, icon: Icon }) => (
        <Button key={label} variant="action" onClick={() => onAction(label)}>
          <Icon className="w-4 h-4 mr-1.5" />
          <span>{label}</span>
        </Button>
      ))}
    </div>
  )
}

export function VerifiedCard({
  orderNumber = "ORD–005",
  date = "3 Oct",
  daysLeft = 19,
}: {
  orderNumber?: string
  date?: string
  daysLeft?: number
}) {
  return (
    <div className="verified-card">
      <strong>
        <Check className="w-3.5 h-3.5" />
        Order verified
      </strong>
      <p>
        <span className="mono">{orderNumber}</span> · Delivered {date} · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left to return
      </p>
    </div>
  )
}

export function ReturnItemCard({
  name = "Gadget B",
  initials = "GB",
  price = "₹50.00",
  ordered = 3,
  imageUrl,
  quantity,
  onQuantity,
  onReturn,
  locked = false,
  disabled = false,
}: {
  name?: string
  initials?: string
  price?: string
  ordered?: number
  imageUrl?: string
  quantity: number
  onQuantity?: (n: number) => void
  onReturn?: () => void
  locked?: boolean
  disabled?: boolean
}) {
  return (
    <ChatCard>
      <div className="product-row">
        <div className="product-monogram small">
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="w-full h-full object-cover rounded-md" />
          ) : (
            initials
          )}
        </div>
        <div className="product-copy">
          <strong>{name}</strong>
          <span>{price} · Ordered {ordered}</span>
        </div>
        {!locked && onQuantity && (
          <div className="quantity-stepper">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Decrease quantity"
              disabled={disabled || quantity <= 1}
              onClick={() => onQuantity(Math.max(1, quantity - 1))}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <strong>{quantity}</strong>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Increase quantity"
              disabled={disabled || quantity >= ordered}
              onClick={() => onQuantity(Math.min(ordered, quantity + 1))}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
      {!locked && onReturn && (
        <Button className="card-primary" disabled={disabled} onClick={onReturn}>
          Return this item
        </Button>
      )}
    </ChatCard>
  )
}

export function ChoiceChips({
  options,
  selected,
  onSelect,
  locked = false,
  disabled = false,
  note = "Answered chips lock so old taps can’t change the flow",
}: {
  options: string[]
  selected?: string
  onSelect: (value: string) => void
  locked?: boolean
  disabled?: boolean
  note?: string
}) {
  return (
    <div>
      <div className="choice-chips">
        {options.map((option) => (
          <Button
            key={option}
            variant={selected === option ? "selected" : "chip"}
            size="sm"
            data-selected={selected === option ? "true" : undefined}
            disabled={disabled || (locked && selected !== option)}
            onClick={() => onSelect(option)}
            className={selected === option ? "!bg-[#007aff] !text-white !opacity-100 font-semibold shadow-sm" : undefined}
          >
            {selected === option && <Check className="w-3.5 h-3.5 mr-1 inline" />}
            {option}
          </Button>
        ))}
      </div>
      {note && <p className="chips-note">{note}</p>}
    </div>
  )
}

export function PhotoCard({
  initialPhotos = [],
  onContinue,
  onPhotosChange,
  disabled = false,
}: {
  initialPhotos?: string[]
  onContinue: (skipped: boolean) => void
  onPhotosChange?: (photos: File[]) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<Array<{url:string;file?:File}>>(initialPhotos.map(url=>({url})))

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 4 - photos.length)
    const updated = [...photos, ...files.map(file => ({url:URL.createObjectURL(file),file}))]
    setPhotos(updated)
    if (onPhotosChange) onPhotosChange(updated.flatMap(photo=>photo.file?[photo.file]:[]))
    event.target.value = ''
  }

  const removePhoto = (index: number) => {
    const removed=photos[index]
    if(removed?.file)URL.revokeObjectURL(removed.url)
    const updated = photos.filter((_, i) => i !== index)
    setPhotos(updated)
    if (onPhotosChange) onPhotosChange(updated.flatMap(photo=>photo.file?[photo.file]:[]))
  }

  return (
    <ChatCard>
      <div className="photo-grid">
        {photos.map((photo, i) => (
          <div className="photo-tile" key={photo.url}>
            <img
              src={photo.url}
              width={64}
              height={64}
              alt={`Product attachment ${i + 1}`}
              loading="lazy"
            />
            <span>{photo.file?.name||`IMG_0${i + 2}.jpg`}</span>
            <Button
              variant="send"
              size="icon-xs"
              className="remove-photo"
              aria-label="Remove photo"
              disabled={disabled}
              onClick={() => removePhoto(i)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
        {photos.length < 4 && (
          <Button 
            variant="ghost" 
            className="add-photo" 
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        disabled={disabled}
        onChange={handleFileChange}
      />
      <div className="photo-status">
        <span>
          <Check className="w-3.5 h-3.5 inline mr-1" />
          {photos.length} photo{photos.length === 1 ? "" : "s"} added
        </span>

      </div>
      <Button 
        className="card-primary" 
        disabled={disabled || photos.length === 0} 
        onClick={() => onContinue(false)}
      >
        Continue
      </Button>
    </ChatCard>
  )
}

export function ReviewCard({
  itemName = "Gadget B",
  quantity = 2,
  orderNumber = "ORD–005",
  reason = "Damaged",
  outcome = "Refund INR 150",
  photoCount = 1,
  stepText = "Step 5 of 6",
  locked = false,
  disabled = false,
  onConfirm,
  onEdit,
  onCancel,
}: {
  itemName?: string
  quantity?: number
  orderNumber?: string
  reason?: string
  outcome?: string
  photoCount?: number
  stepText?: string
  locked?: boolean
  disabled?: boolean
  onConfirm: () => void
  onEdit?: () => void
  onCancel?: () => void
}) {
  return (
    <ChatCard>
      <div className="card-heading">
        <strong>
          <FileText className="w-4 h-4 mr-1.5 inline" />
          Review your request
        </strong>
        <span className="mono">{stepText}</span>
      </div>
      <dl className="review-details">
        <div>
          <dt>Item:</dt>
          <dd>{itemName} × {quantity}</dd>
        </div>
        <div>
          <dt>Order:</dt>
          <dd className="mono">{orderNumber}</dd>
        </div>
        <div>
          <dt>Reason:</dt>
          <dd>
            {reason} {photoCount > 0 && <span>· {photoCount} photo{photoCount > 1 ? 's' : ''}</span>}
          </dd>
        </div>
        <div>
          <dt>Outcome:</dt>
          <dd className="success-text">{outcome}</dd>
        </div>
      </dl>
      {!locked && (
        <div className="review-actions">
          <Button className="card-primary" disabled={disabled} onClick={onConfirm}>Confirm</Button>
          {onEdit && (
            <Button variant="chip" disabled={disabled} onClick={onEdit}>
              Edit
            </Button>
          )}
          {onCancel && (
            <Button variant="ghost" disabled={disabled} onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </ChatCard>
  )
}

export function TicketCard({
  ticketNumber = "TKT–000004",
  orderNumber = "ORD–005",
  status = "In review",
  updatedAt = "just now",
  onStatus,
  onAgent,
}: {
  ticketNumber?: string
  orderNumber?: string
  status?: string
  updatedAt?: string
  onStatus?: () => void
  onAgent?: () => void
}) {
  return (
    <ChatCard>
      <div className="ticket-heading">
        <Ticket className="w-5 h-5" />
        <div>
          <strong className="mono">{ticketNumber}</strong>
          <span>Return · {orderNumber} · Updated {updatedAt}</span>
        </div>
        <span className="review-badge">{status}</span>
      </div>
      <div className="ticket-stages">
        <span className="created">
          <i />
          Created
        </span>
        <span className="in-review">
          <i />
          Review
        </span>
        <span>Pickup</span>
        <span>Refund</span>
      </div>
      <div className="ticket-progress">
        <i />
        <i />
      </div>
      <p className="ticket-description">
        Your refund request was raised successfully. We'll notify you as soon as it is reviewed.
      </p>
      <div className="ticket-actions">
        {onStatus && (
          <Button variant="chip" onClick={onStatus}>
            Check status
          </Button>
        )}
        {onAgent && (
          <Button variant="outline" onClick={onAgent}>
            Talk to agent
          </Button>
        )}
      </div>
    </ChatCard>
  )
}

export function FeedbackCard({
  onAgent,
  onRate,
}: {
  onAgent?: () => void
  onRate?: (rating: number) => void
}) {
  const [rating, setRating] = useState(0)
  return (
    <ChatCard>
      <div className="card-heading feedback-heading">
        <strong>{rating ? "Thank you for your feedback" : "How was your experience?"}</strong>
        <span>Feedback</span>
      </div>
      <div className="rating-row">
        {[1, 2, 3, 4, 5].map((value) => (
          <Button
            key={value}
            variant={rating === value ? "selected" : "chip"}
            aria-label={`Rate ${value} stars`}
            onClick={() => {
              setRating(value)
              if (onRate) onRate(value)
            }}
          >
            <Star className="w-3.5 h-3.5 mr-0.5" />
            {value}
          </Button>
        ))}
      </div>
      {onAgent && (
        <Button variant="chip" className="feedback-agent" onClick={onAgent}>
          <MessageCircle className="w-4 h-4 mr-1.5" />
          Talk to an agent
        </Button>
      )}
    </ChatCard>
  )
}

export function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ChatCard>
      <div className="card-heading">
        <strong>{title}</strong>
        <ArrowUpRight className="w-4 h-4" />
      </div>
      <div className="detail-content">{children}</div>
    </ChatCard>
  )
}
