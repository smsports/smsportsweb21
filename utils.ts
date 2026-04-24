
import { AuctionState, Team, Player } from './types';

/**
 * Calculates the maximum allowed bid for a team, ensuring they have enough 
 * budget left to fill their squad up to the required minimums and total size.
 */
export const calculateMaxBid = (
    team: Team,
    state: AuctionState,
    currentPlayer: Player | null
): { 
    maxBid: number; 
    reservedFunds: number; 
    remainingSlots: number;
    allowBid: boolean;
    reason: string | null;
    categoryStatus: { name: string, current: number, min: number, reserved: number }[];
} => {
    const { 
        maxPlayersPerTeam = 25, 
        categories = [], 
        unlimitedPurse = false,
        autoReserveFunds = false,
        basePrice: globalBasePrice = 100
    } = state;

    const currentSquadCount = team.players.length;
    const remainingSlotsIfBought = Math.max(0, maxPlayersPerTeam - (currentSquadCount + 1));

    if (unlimitedPurse) {
        return { 
            maxBid: Infinity, 
            reservedFunds: 0, 
            remainingSlots: remainingSlotsIfBought, 
            allowBid: true, 
            reason: null,
            categoryStatus: []
        };
    }

    // 1. Calculate Reservation
    let totalReservedFunds = 0;
    let mandatorySlotsAfterCurrent = 0;
    const categoryStatus: { name: string, current: number, min: number, reserved: number }[] = [];

    if (autoReserveFunds) {
        categories.forEach(cat => {
            const countInTeam = team.players.filter(p => p.category === cat.name).length;
            let neededForMin = Math.max(0, (cat.minPerTeam || 0) - countInTeam);

            // If current player is in this category, they help fulfill the requirement
            if (currentPlayer && currentPlayer.category === cat.name) {
                neededForMin = Math.max(0, neededForMin - 1);
            }

            const catBasePrice = (cat.basePrice && cat.basePrice > 0) ? cat.basePrice : globalBasePrice;
            const reservation = neededForMin * catBasePrice;
            
            totalReservedFunds += reservation;
            mandatorySlotsAfterCurrent += neededForMin;

            categoryStatus.push({
                name: cat.name,
                current: countInTeam + (currentPlayer?.category === cat.name ? 1 : 0),
                min: cat.minPerTeam || 0,
                reserved: reservation
            });
        });

        // Flexible slots (any category) to reach max squad size
        const flexibleSlots = Math.max(0, remainingSlotsIfBought - mandatorySlotsAfterCurrent);
        totalReservedFunds += (flexibleSlots * globalBasePrice);
    }

    const maxPossibleBid = team.budget - totalReservedFunds;

    // 2. Validation Rules
    let allowBid = true;
    let reason = null;

    // Check Squad Limit
    if (currentSquadCount >= maxPlayersPerTeam) {
        allowBid = false;
        reason = "Squad is full";
    }

    // Check Category Max Limit
    if (allowBid && currentPlayer && currentPlayer.category) {
        const catConfig = categories.find(c => c.name === currentPlayer.category);
        if (catConfig && catConfig.maxPerTeam > 0) {
            const countInCat = team.players.filter(p => p.category === currentPlayer.category).length;
            if (countInCat >= catConfig.maxPerTeam) {
                allowBid = false;
                reason = `Limit for ${catConfig.name} reached`;
            }
        }
    }

    // Check Budget vs Base Price (and reservation)
    if (allowBid && currentPlayer) {
        const effectiveBase = getEffectiveBasePrice(currentPlayer, categories);
        if (team.budget < effectiveBase) {
            allowBid = false;
            reason = "Budget below base price";
        } else if (autoReserveFunds && maxPossibleBid < effectiveBase) {
            allowBid = false;
            reason = "Reserved funds required";
        }
    }

    return {
        maxBid: maxPossibleBid,
        reservedFunds: totalReservedFunds,
        remainingSlots: remainingSlotsIfBought,
        allowBid,
        reason,
        categoryStatus
    };
};

/**
 * Returns the effective base price of a player, considering their category.
 */
export const getEffectiveBasePrice = (player: Player, categories: any[]): number => {
    let basePrice = Number(player.basePrice) || 0;
    if (player.category) {
        const cat = categories.find(c => c.name === player.category);
        if (cat && cat.basePrice !== undefined && cat.basePrice !== null && cat.basePrice > 0) {
            // Priority given to category base price if it's set
            return Number(cat.basePrice);
        }
    }
    return basePrice;
};
