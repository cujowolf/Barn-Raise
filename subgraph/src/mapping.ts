import { BigDecimal, BigInt, Address, store } from "@graphprotocol/graph-ts"
import {
  BarnRaise,
  CreateBarnRaise,
  CreateBid,
  Sow,
  UpdateBid
} from "../generated/BarnRaise/BarnRaise"
import { 
  BarnRaise as BarnRaiseEntity,
  Bid,
  Farmer,
  Weather
} from "../generated/schema"
import { ADDRESS_ZERO, ZERO_BI, ONE_BI, ZERO_BD, ONE_BD, TWO_BI, BI_6, BI_10, BI_18, biToBD, BidStatus, EventType, EventStatus } from "./helpers"

export function handleCreateBarnRaise(event: CreateBarnRaise): void {
  let br = BarnRaiseEntity.load('0')
  if (!br) {
    br = new BarnRaiseEntity('0')
  }
  br.bidStart = event.params.bidStart
  br.bonusPerDay = event.params.bonusPerDay
  br.start = event.params.start
  br.length = event.params.length
  br.end = br.start.plus(br.length)
  br.weatherStep = event.params.weatherStep
  br.save()
}

export function handleCreateBid(event: CreateBid): void {
  let farmer = getFarmer(event.params.account)
  let barnRaise = BarnRaiseEntity.load('0')!

  let bid = createBid(
    event.block.timestamp,
    biToBD(event.params.amount, BI_18),
    event.params.account,
    event.params.weather,
    event.params.idx,
    event.params.bonus
  );

  farmer.totalBid = farmer.totalBid.plus(bid.baseAmount)

  farmer.numberOfBids = farmer.numberOfBids.plus(ONE_BI)

  barnRaise.numberOfBids = barnRaise.numberOfBids.plus(ONE_BI)
  barnRaise.totalRaised = barnRaise.totalRaised.plus(bid.baseAmount)
  barnRaise.totalBid = barnRaise.totalBid.plus(bid.baseAmount)
  barnRaise.totalBidUnsown = barnRaise.totalBidUnsown.plus(bid.baseAmount)

  barnRaise.save()
  farmer.save()

  // To Do: IF WEATHER IS CURRENT WEATHER, THEN SOW
}

export function handleSow(event: Sow): void {}

export function handleUpdateBid(event: UpdateBid): void {
  let farmer = getFarmer(event.params.account)
  let oldWeather = getWeather(event.params.prevWeather)
  let barnRaise = BarnRaiseEntity.load('0')!

  let oldId = `${event.params.account.toHexString()}-${event.params.prevWeather}-${event.params.prevIdx}`
  let oldBid = Bid.load(oldId)!

  let updatedAmount = biToBD(event.params.updatedAmount, BI_18)
  oldBid.updatedAt = event.block.timestamp
  oldBid.baseAmount = oldBid.baseAmount.minus(updatedAmount)
  oldBid.basePods = amountToPods(oldBid.baseAmount, event.params.prevWeather)
  oldBid.bonusAmount = amountToBonus(oldBid.baseAmount, oldBid.bonusPercent)
  oldBid.bonusPods = amountToPods(oldBid.bonusAmount, event.params.prevWeather)
  oldBid.totalAmount = oldBid.baseAmount.plus(oldBid.bonusAmount)
  oldBid.totalPods = oldBid.basePods.plus(oldBid.bonusPods)

  oldWeather.baseAmount = oldWeather.baseAmount.minus(updatedAmount)
  oldWeather.basePods = amountToPods(oldWeather.baseAmount, event.params.prevWeather)
  oldWeather.bonusAmount = oldWeather.bonusAmount.minus(amountToBonus(updatedAmount, oldBid.bonusPercent))
  oldWeather.bonusPods = amountToPods(oldWeather.bonusAmount, event.params.prevWeather)
  oldWeather.totalAmount = oldWeather.baseAmount.plus(oldWeather.bonusAmount)
  oldWeather.totalPods = oldWeather.basePods.plus(oldWeather.bonusPods)

  // If we are splitting the bid, then we add a new bid.
  if (oldBid.baseAmount.gt(ZERO_BD)) {
    barnRaise.numberOfBids = barnRaise.numberOfBids.plus(ONE_BI)
    oldBid.save()
  } else {
    store.remove("Bid", oldBid.id)
    oldWeather.numberOfBids = oldWeather.numberOfBids.minus(ONE_BI)
    let bidIds = oldWeather.bidIds
    const idx = bidIds.indexOf(oldId)
    bidIds.splice(idx, 1)
    oldWeather.bidIds = bidIds
  }

  let addedAmount = biToBD(event.params.addedAmount, BI_18)
  barnRaise.totalRaised = barnRaise.totalRaised.plus(addedAmount)
  barnRaise.totalBid = barnRaise.totalBid.plus(addedAmount)
  barnRaise.totalBidUnsown = barnRaise.totalBidUnsown.plus(addedAmount)
  farmer.totalBid = farmer.totalBid.plus(addedAmount)
  // TODO: REST OF FARMER DATA

  let newAmount = updatedAmount.plus(addedAmount)
  createBid(
    event.block.timestamp,
    newAmount,
    event.params.account,
    event.params.newWeather,
    event.params.newIdx,
    event.params.newBonus
  );
  oldWeather.save()
  barnRaise.save()
  farmer.save()

   // To Do: IF WEATHER IS CURRENT WEATHER, THEN SOW
}

function createBid(timestamp: BigInt, amount: BigDecimal, account: Address, wea: BigInt, idx: BigInt, bonus: BigInt): Bid {
  let weather = getWeather(wea)
  let id = `${account.toHexString()}-${wea}-${idx}`
  let bid = new Bid(id)
  bid.idx = idx
  bid.farmer = account.toHexString()
  bid.createdAt = timestamp
  bid.updatedAt = timestamp
  bid.weather = wea
  bid.status = BidStatus.ACTIVE

  bid.baseAmount = amount
  bid.basePods = amountToPods(bid.baseAmount, wea)
  bid.bonusPercent = bonus
  bid.bonusAmount = amountToBonus(bid.baseAmount, bonus)
  bid.bonusPods = amountToPods(bid.bonusAmount, wea)
  bid.totalAmount = bid.baseAmount.plus(bid.bonusAmount)
  bid.totalPods = bid.basePods.plus(bid.bonusPods)

  weather.numberOfBids = weather.numberOfBids.plus(ONE_BI)
  weather.baseAmount = weather.baseAmount.plus(bid.baseAmount)
  weather.basePods = weather.basePods.plus(bid.basePods)
  weather.bonusAmount = weather.bonusAmount.plus(bid.bonusAmount)
  weather.bonusPods = weather.bonusPods.plus(bid.bonusPods)
  weather.totalAmount = weather.totalAmount.plus(bid.totalAmount)
  weather.totalPods = weather.totalPods.plus(bid.totalPods)

  let bidIds = weather.bidIds
  bidIds.push(id)
  weather.bidIds = bidIds

  weather.save()
  bid.save()

  // TO DO: AUTO-SOW IF WEATHER = CURRENT WEATHER
  return bid
}

function getFarmer(address : Address) : Farmer {
  let farmer = Farmer.load(address.toHexString())
  if (farmer == null) return new Farmer(address.toHexString())
  return farmer as Farmer
}

function getWeather(w: BigInt) : Weather {
  let weather = Weather.load(`${w}`)
  if (weather == null) return new Weather(`${w}`)
  return weather as Weather
}

function amountToBonus(amount: BigDecimal, bonus: BigInt): BigDecimal {
  return amount.times(biToBD(bonus, TWO_BI))
}

function amountToPods(amount: BigDecimal, weather: BigInt): BigDecimal {
  return amount.times(ONE_BD.plus(biToBD(weather, TWO_BI)));
}