
import { AuctionState, Team, Player } from './types';

/**
 * Calculates the maximum allowed bid for a team, ensuring they have enough 
 * budget left to fill their squad up to the required minimums and total size.
 * This implementation uses the lowest available base prices for reservation.
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
        players = [],
        unlimitedPurse = false,
    } = state;

    const currentSquadCount = team.players.length;
    const targetSquadSize = maxPlayersPerTeam;
    
    // Remaining slots AFTER potentially buying the current player
    const remainingSlots = Math.max(0, targetSquadSize - (currentSquadCount + 1));

    if (unlimitedPurse) {
        return { 
            maxBid: Infinity, 
            reservedFunds: 0, 
            remainingSlots, 
            allowBid: true, 
            reason: null,
            categoryStatus: []
        };
    }

    // --- 1. Identify Available Players & Their Prices ---
    // We exclude already SOLD players and the current player (since we are bidding for them)
    // We treat TRADED as SOLD for the pool logic.
    const availablePool = players.filter(p => 
        !p.status && String(p.id) !== String(currentPlayer?.id)
    );

    // --- 2. Category-Specific Reservation ---
    let totalCategoryReservation = 0;
    let mandatoryCategorySlotsUsed = 0;
    const categoryStatus: { name: string, current: number, min: number, reserved: number }[] = [];

    categories.forEach(cat => {
        const countInTeam = team.players.filter(p => p.category === cat.name).length;
        let neededInCat = Math.max(0, (cat.minPerTeam || 0) - countInTeam);

        // If current player is in this category, they satisfy one of the needed mandatory slots
        if (currentPlayer && currentPlayer.category === cat.name) {
            neededInCat = Math.max(0, neededInCat - 1);
        }

        if (neededInCat > 0) {
            // Find the lowest base prices available for THIS category
            const catPoolPrices = availablePool
                .filter(p => p.category === cat.name)
                .map(p => p.basePrice)
                .sort((a, b) => a - b);

            // Reserve using the cheapest players in this category
            for (let i = 0; i < neededInCat; i++) {
                // If pool is empty, fallback to category base price or global base price
                const priceMatch = catPoolPrices[i] !== undefined ? catPoolPrices[i] : (cat.basePrice || state.basePrice || 100);
                totalCategoryReservation += priceMatch;
            }
            mandatoryCategorySlotsUsed += neededInCat;
            
            categoryStatus.push({ 
                name: cat.name, 
                current: countInTeam + (currentPlayer?.category === cat.name ? 1 : 0), 
                min: cat.minPerTeam,
                reserved: neededInCat // Track count reserved
            });
        }
    });

    // --- 3. General Slot Reservation (Flexible Slots) ---
    // Total slots we MUST fill beyond the current player
    const totalRemainingToFill = remainingSlots; 
    const flexibleSlotsCount = Math.max(0, totalRemainingToFill - mandatoryCategorySlotsUsed);
    
    // For flexible slots, we use the cheapest players across the WHOLE pool 
    // that haven't been "claimed" by the mandatory category reservation.
    const allPoolPrices = availablePool
        .map(p => p.basePrice)
        .sort((a, b) => a - b);

    // We skip the cheapest 'mandatoryCategorySlotsUsed' players because they are already accounted for 
    // in the category-specific reservation (worst-case scenario: they are the same players)
    // Wait, actually, the most conservative approach:
    // We take the sum of cheapest category players, AND then take the cheapest remaining players for flexible slots.
    
    let generalPoolReservation = 0;
    for (let i = 0; i < flexibleSlotsCount; i++) {
        // Offset by mandatory count to pick the 'next' cheapest players
        const priceIndex = mandatoryCategorySlotsUsed + i;
        const priceMatch = allPoolPrices[priceIndex] !== undefined ? allPoolPrices[priceIndex] : (state.basePrice || 100);
        generalPoolReservation += priceMatch;
    }

    const totalReservedFunds = totalCategoryReservation + generalPoolReservation;
    const maxBid = team.budget - totalReservedFunds;

    // --- 4. Validation Rules ---
    let allowBid = true;
    let reason = null;

    if (maxBid < (currentPlayer?.basePrice || 0)) {
        allowBid = false;
        reason = "Cannot afford base price after reserving funds for squad completion";
    }

    // Check if squad is already full
    if (currentSquadCount >= targetSquadSize) {
        allowBid = false;
        reason = "Squad is already full";
    }
    
    // Check Category Max (Optional, but good for completeness)
    if (currentPlayer && currentPlayer.category) {
        const catConfig = categories.find(c => c.name === currentPlayer.category);
        if (catConfig && catConfig.maxPerTeam > 0) {
            const currentCount = team.players.filter(p => p.category === currentPlayer.category).length;
            if (currentCount >= catConfig.maxPerTeam) {
                allowBid = false;
                reason = `Maximum limit for ${catConfig.name} reached`;
            }
        }
    }

    return {
        maxBid,
        reservedFunds: totalReservedFunds,
        remainingSlots,
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
