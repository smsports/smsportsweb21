
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

    const currentSquadCount = (team.players || []).length;
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
            const playersList = team.players || [];
            // Case-insensitive, robust matching
            const countInTeam = playersList.filter(p => p.category?.toLowerCase().trim() === cat.name?.toLowerCase().trim()).length;
            let neededForMin = Math.max(0, (cat.minPerTeam || 0) - countInTeam);

            // If current player is in this category, they help fulfill the requirement
            if (currentPlayer && currentPlayer.category?.toLowerCase().trim() === cat.name?.toLowerCase().trim()) {
                neededForMin = Math.max(0, neededForMin - 1);
            }

            const catBasePrice = (cat.basePrice !== undefined && cat.basePrice !== null) ? Number(cat.basePrice) : Number(globalBasePrice);
            const reservation = neededForMin * catBasePrice;
            
            totalReservedFunds += reservation;
            mandatorySlotsAfterCurrent += neededForMin;

            categoryStatus.push({
                name: cat.name,
                current: countInTeam + ((currentPlayer && currentPlayer.category?.toLowerCase().trim() === cat.name?.toLowerCase().trim()) ? 1 : 0),
                min: cat.minPerTeam || 0,
                reserved: reservation
            });
        });

        // Flexible slots (any category) to reach max squad size
        const flexibleSlots = Math.max(0, remainingSlotsIfBought - mandatorySlotsAfterCurrent);
        // Find minimum base price among all configured categories for flexible slots, falling back to global base price
        const minCatPrice = categories.length > 0
            ? Math.min(...categories.map(c => (c.basePrice !== undefined && c.basePrice !== null) ? Number(c.basePrice) : Number(globalBasePrice)))
            : Number(globalBasePrice);
        const flexibleBasePrice = Math.max(minCatPrice, Number(globalBasePrice));
        totalReservedFunds += (flexibleSlots * flexibleBasePrice);
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

    // Check Slot Feasibility (Can we fulfill remaining mandatory requirements?)
    if (allowBid && autoReserveFunds && remainingSlotsIfBought < mandatorySlotsAfterCurrent) {
        allowBid = false;
        reason = "Reserve required for other categories";
    }

    // Check Category Max Limit
    if (allowBid && currentPlayer && currentPlayer.category) {
        const catConfig = categories.find(c => c.name?.toLowerCase().trim() === currentPlayer.category?.toLowerCase().trim());
        if (catConfig && catConfig.maxPerTeam > 0) {
            const playersList = team.players || [];
            const countInCat = playersList.filter(p => p.category?.toLowerCase().trim() === currentPlayer.category?.toLowerCase().trim()).length;
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
