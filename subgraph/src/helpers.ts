import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts"

export let ADDRESS_ZERO = Address.fromString('0x0000000000000000000000000000000000000000')
export let BARN_RAISE_ADDRESS = Address.fromString('0x928969D2C9D7E6a91125f2DCc459Bf20D1E59E28')

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let TWO_BI = BigInt.fromI32(2)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)
export let BI_10 = BigInt.fromI32(10)
export let BI_6 = BigInt.fromI32(6)

export function toBI(amount: i32): BigInt {
  return BigInt.fromI32(amount)
}
export function biToBD(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export const enum BidStatus {
  ACTIVE = 0,
  FILLED,
  PARTIAL,
  FAILED,
}

export const enum EventType {
  CREATE = 0,
  UPDATE
}

export const enum EventStatus {
  SUCCESS = 0,
  FAILURE
}
