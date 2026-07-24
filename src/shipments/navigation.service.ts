import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface RouteWaypoint {
  id: string;
  instruction: string;
  voicePrompt: string;
  lat: number;
  lng: number;
}

@Injectable()
export class NavigationService {
  constructor(private readonly httpService: HttpService) {}

  /**
   * Generates step-by-step turn waypoints formatted with custom audio prompts
   * for the PWA map frontend text-to-speech assistant.
   */
  async getVoiceRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=bicycling&key=${apiKey}`;

    try {
      const response = await firstValueFrom(this.httpService.get(url));
      const route = response.data?.routes?.[0];

      if (!route) {
        throw new BadRequestException('Could not compute navigation route.');
      }

      const steps: RouteWaypoint[] = route.legs[0].steps.map(
        (step: any, index: number) => {
          const text = step.html_instructions.replace(/<[^>]*>?/gm, ''); // Clean HTML tags
          let voicePrompt = text;

          if (step.maneuver === 'turn-left') {
            voicePrompt = `In 40 meters, turn left onto ${text.replace(/Turn left onto /i, '')}. Keep your head up!`;
          } else if (step.maneuver === 'turn-right') {
            voicePrompt = `In 40 meters, turn right onto ${text.replace(/Turn right onto /i, '')}.`;
          } else {
            voicePrompt = `Continue straight on ${text}.`;
          }

          return {
            id: `step-${index}`,
            instruction: text,
            voicePrompt,
            lat: step.end_location.lat,
            lng: step.end_location.lng,
          };
        },
      );

      // Append custom destination arrival prompts
      steps.push({
        id: 'near-dest',
        instruction: 'Almost there!',
        voicePrompt:
          "You're almost there! Look out for your destination and prepare to pull over.",
        lat: destLat,
        lng: destLng,
      });

      steps.push({
        id: 'arrived',
        instruction: 'You have arrived!',
        voicePrompt:
          "You have arrived at your destination. Great job! Don't forget to ask the recipient for their delivery PIN.",
        lat: destLat,
        lng: destLng,
      });

      return {
        distance: route.legs[0].distance.text,
        duration: route.legs[0].duration.text,
        steps,
      };
    } catch (error) {
      console.error('[NAVIGATION_SERVICE_ERROR]', error);
      throw new BadRequestException('Failed to calculate navigation route.');
    }
  }
}