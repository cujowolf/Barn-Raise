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
import { ADDRESS_ZERO, ZERO_BI, ONE_BI, ZERO_BD, ONE_BD, TWO_BI, BI_6, BI_10, BI_18, toBI, biToBD, BidStatus, EventType, EventStatus } from "./helpers"

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

  farmer.totalBid = farmer.totalBid.plus(bid.amount)

  farmer.numberOfBids = farmer.numberOfBids.plus(ONE_BI)

  barnRaise.numberOfBids = barnRaise.numberOfBids.plus(ONE_BI)
  barnRaise.totalRaised = barnRaise.totalRaised.plus(bid.amount)
  barnRaise.totalBid = barnRaise.totalBid.plus(bid.amount)
  barnRaise.totalBidUnsown = barnRaise.totalBidUnsown.plus(bid.amount)

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
  oldBid.amount = oldBid.amount.minus(updatedAmount)
  oldBid.basePods = amountToPods(oldBid.amount, event.params.prevWeather)
  oldBid.bonusPods = amountToPods(oldBid.amount, toBI(oldBid.bonusWeather))
  oldBid.totalPods = oldBid.basePods.plus(oldBid.bonusPods)

  oldWeather.amount = oldWeather.amount.minus(updatedAmount)
  oldWeather.basePods = amountToPods(oldWeather.amount, event.params.prevWeather)
  oldWeather.bonusPods = oldWeather.bonusPods.minus(amountToBonusPods(updatedAmount, toBI(oldBid.bonusWeather)))
  oldWeather.totalPods = oldWeather.basePods.plus(oldWeather.bonusPods)

  // If we are splitting the bid, then we add a new bid.
  if (oldBid.amount.gt(ZERO_BD)) {
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
  bid.status = BidStatus.ACTIVE

  bid.amount = amount

  bid.weather = wea.toI32()
  bid.bonusWeather = bonus.toI32()
  bid.totalWeather = wea.plus(bonus).toI32()

  bid.basePods = amountToPods(bid.amount, wea)
  bid.bonusPods = amountToBonusPods(bid.amount, bonus)
  bid.totalPods = bid.basePods.plus(bid.bonusPods)

  weather.numberOfBids = weather.numberOfBids.plus(ONE_BI)
  weather.amount = weather.amount.plus(bid.amount)
  weather.basePods = weather.basePods.plus(bid.basePods)
  weather.bonusPods = weather.bonusPods.plus(bid.bonusPods)
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
  if (weather == null) {
    let wea = new Weather(`${w}`)
    wea.weather = w.toI32()
    return wea
  }
  return weather as Weather
}

function amountToBonusPods(amount: BigDecimal, bonus: BigInt): BigDecimal {
  return amount.times(biToBD(bonus, TWO_BI))
}

function amountToPods(amount: BigDecimal, weather: BigInt): BigDecimal {
  return amount.times(ONE_BD.plus(biToBD(weather, TWO_BI)));
}