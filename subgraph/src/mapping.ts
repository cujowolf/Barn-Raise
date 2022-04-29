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
  Plot,
  Weather
} from "../generated/schema"
import { ADDRESS_ZERO, ZERO_BI, ONE_BI, ZERO_BD, ONE_BD, TWO_BI, BI_6, BI_10, BI_18, toBI, biToBD, BidStatus, EventType, EventStatus, BARN_RAISE_ADDRESS } from "./helpers"

/* ========================
    Event Handlers
   ========================*/
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
  br.numberOfBids = ZERO_BI
  br.totalBid = ZERO_BD
  br.totalBidSown = ZERO_BD
  br.totalBidUnsown = ZERO_BD
  br.totalUserSown = ZERO_BD
  br.totalSown = ZERO_BD
  br.totalRaised = ZERO_BD
  br.lastWeatherBidsFilled = ZERO_BI
  br.totalPods = ZERO_BD
  br.save()
}

export function handleCreateBid(event: CreateBid): void {
  let farmer = loadOrCreateFarmer(event.params.account)
  let barnRaise = BarnRaiseEntity.load('0')!

  let bid = createBid(
    event.block.timestamp,
    biToBD(event.params.amount, BI_6),
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

  // Fill any bids if weather is at current weather
  let barnRaiseContract = BarnRaise.bind(BARN_RAISE_ADDRESS)
  let currentWeather = barnRaiseContract.try_getWeather()
  if (!currentWeather.reverted) {
    if (event.params.weather <= currentWeather.value) {
      fillBids(event.block.timestamp, currentWeather.value)
    }
  }
}

export function handleSow(event: Sow): void {
  fillBids(event.block.timestamp, event.params.weather)
  recordPlot(event.block.timestamp, null, event)
}

export function handleUpdateBid(event: UpdateBid): void {
  let farmer = loadOrCreateFarmer(event.params.account)
  let oldWeather = loadOrCreateWeather(event.params.prevWeather)
  let barnRaise = BarnRaiseEntity.load('0')!

  let oldId = `${event.params.account.toHexString()}-${event.params.prevWeather}-${event.params.prevIdx}`
  let oldBid = Bid.load(oldId)!

  let updatedAmount = biToBD(event.params.alteredAmount, BI_6)
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

  let addedAmount = biToBD(event.params.addedAmount, BI_6)
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

  // Fill any bids if weather is at current weather
  let barnRaiseContract = BarnRaise.bind(BARN_RAISE_ADDRESS)
  let currentWeather = barnRaiseContract.try_getWeather()
  if (!currentWeather.reverted) {
    if (event.params.newWeather <= currentWeather.value) {
      fillBids(event.block.timestamp, currentWeather.value)
    }
  }
}

/* ========================
    Entity Loading and Creating
   ========================*/

function loadOrCreateFarmer(address: Address): Farmer {
  let farmer = Farmer.load(address.toHexString())
  if (farmer == null) {
    farmer = new Farmer(address.toHexString())
    farmer.numberOfBids = ZERO_BI
    farmer.totalBid = ZERO_BD
    farmer.numberOfPlots = ZERO_BI
    farmer.totalPods = ZERO_BD
    farmer.save()
  }

  return farmer as Farmer
}

function loadOrCreateWeather(w: BigInt): Weather {
  let weather = Weather.load(`${w}`)
  if (weather == null) {
    weather = new Weather(`${w}`)
    weather.weather = w.toI32()
    weather.bidIds = []
    weather.numberOfBids = ZERO_BI
    weather.numberOfSows = ZERO_BI
    weather.amount = ZERO_BD
    weather.basePods = ZERO_BD
    weather.bonusPods = ZERO_BD
    weather.totalPods = ZERO_BD
    weather.save()
  }
  return weather as Weather
}

function loadOrCreatePlot(farmerAddress: Address): Plot {
  let farmer = loadOrCreateFarmer(farmerAddress)
  let id = farmerAddress.toHexString() + '-' + farmer.numberOfPlots.toString()
  let plot = Plot.load(id)
  if (plot == null) {
    plot = new Plot(id)
    plot.farmer = farmerAddress.toHexString()
    plot.amount = ZERO_BD
    plot.placeInLine = ZERO_BD
    plot.totalPods = ZERO_BD
    plot.save()
  }
  return plot as Plot
}

/* ========================
    Internal Helpers
   ========================*/

function createBid(timestamp: BigInt, amount: BigDecimal, account: Address, wea: BigInt, idx: BigInt, bonus: BigInt): Bid {
  let weather = loadOrCreateWeather(wea)
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

  return bid
}

function recordPlot(timestamp: BigInt, bid: Bid | null, sow: Sow | null): void {
  let barnRaise = BarnRaiseEntity.load('0')!

  if (bid != null) {
    let farmerAddress = Address.fromString(bid.farmer)
    let farmer = loadOrCreateFarmer(farmerAddress)
    let plot = loadOrCreatePlot(farmerAddress)

    bid.status = BidStatus.FILLED
    bid.updatedAt = timestamp

    plot.placeInLine = barnRaise.totalPods
    plot.amount = bid.amount
    plot.totalPods = bid.totalPods

    farmer.numberOfPlots = farmer.numberOfPlots.plus(ONE_BI)
    farmer.totalPods = farmer.totalPods.plus(plot.totalPods)

    barnRaise.totalBidSown = barnRaise.totalBidSown.plus(plot.amount)
    barnRaise.totalBidUnsown = barnRaise.totalBidUnsown.minus(plot.amount)
    barnRaise.totalSown = barnRaise.totalSown.plus(plot.amount)
    barnRaise.totalPods = barnRaise.totalPods.plus(plot.totalPods)

    farmer.save()
    bid.save()
    plot.save()
    barnRaise.save()
  } else if (sow != null) {
    let farmer = loadOrCreateFarmer(sow.params.account)
    let plot = loadOrCreatePlot(sow.params.account)
    let weather = loadOrCreateWeather(sow.params.weather)

    plot.placeInLine = barnRaise.totalPods
    plot.amount = biToBD(sow.params.amount, BI_6)
    plot.totalPods = amountToPods(plot.amount, sow.params.weather)

    weather.numberOfSows = weather.numberOfSows.plus(ONE_BI)
    weather.amount = weather.amount.plus(plot.amount)
    weather.basePods = weather.basePods.plus(plot.totalPods)
    weather.totalPods = weather.totalPods.plus(plot.totalPods)

    farmer.numberOfPlots = farmer.numberOfPlots.plus(ONE_BI)
    farmer.totalPods = farmer.totalPods.plus(plot.totalPods)

    barnRaise.totalUserSown = barnRaise.totalUserSown.plus(plot.amount)
    barnRaise.totalSown = barnRaise.totalSown.plus(plot.amount)
    barnRaise.totalRaised = barnRaise.totalRaised.plus(plot.amount)
    barnRaise.totalPods = barnRaise.totalPods.plus(plot.totalPods)

    farmer.save()
    plot.save()
    weather.save()
    barnRaise.save()
  }
}

function fillBids(timestamp: BigInt, weather: BigInt): void {
  let weatherCheck = BarnRaiseEntity.load('0')!
  let lastWeather = weatherCheck.lastWeatherBidsFilled

  while (lastWeather <= weather) {
    let currentWeather = loadOrCreateWeather(lastWeather)
    for (let i = 0; i < currentWeather.bidIds.length; i++) {
      let bid = Bid.load(currentWeather.bidIds[i])!
      if (bid.status == BidStatus.ACTIVE) {
        recordPlot(timestamp, bid, null)
      }
    }
    lastWeather = lastWeather.plus(ONE_BI)
  }

  let barnRaise = BarnRaiseEntity.load('0')!
  barnRaise.lastWeatherBidsFilled = lastWeather
  barnRaise.save()
}

function amountToBonusPods(amount: BigDecimal, bonus: BigInt): BigDecimal {
  return amount.times(biToBD(bonus, TWO_BI))
}

function amountToPods(amount: BigDecimal, weather: BigInt): BigDecimal {
  return amount.times(ONE_BD.plus(biToBD(weather, TWO_BI)));
}
