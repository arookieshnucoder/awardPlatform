import { Link } from 'react-router-dom'
import boschLogo from '../../assets/bosch-logo.svg'
import './AwardBrand.css'

/** Bosch artwork sourced unchanged from the official bosch.com header. */
export function AwardBrand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link to="/" className={`dp-award-brand${inverse ? ' dp-award-brand--inverse' : ''}`} aria-label="Bosch Digital home">
      <img src={boschLogo} alt="BOSCH" className="dp-award-brand__logo" />
      <span className="dp-award-brand__divider" aria-hidden="true" />
      <span className="dp-award-brand__title">Bosch Digital</span>
    </Link>
  )
}
